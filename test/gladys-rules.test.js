// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from the real
// answers of Ghost 6.77 (test/fixtures/ghost) and of a fake Ghost, in every
// feature-name language.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../src/app.js';
import { Store } from '../src/store.js';
import { ADMIN_KEY } from './helpers/fakeGhost.js';

process.env.LOG_LEVEL ??= 'silent';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

import { FakeGhost } from './helpers/fakeGhost.js';

const fixture = JSON.parse(
  await readFile(new URL('./fixtures/ghost/ghost-6.77.json', import.meta.url), 'utf8'),
);

/** Answers every request from the real answers of Ghost 6.77, by endpoint. */
const replay = async (url) => {
  const { pathname, searchParams } = new URL(url);
  const filter = searchParams.get('filter');
  let body = fixture.count;
  if (pathname.endsWith('/site/')) {
    body = fixture.site;
  } else if (pathname.endsWith('/newsletters/')) {
    body = fixture.newsletters;
  } else if (pathname.endsWith('/members/') && !filter) {
    body = fixture.members;
  } else if (filter === 'status:published') {
    body = fixture.posts;
  }
  return { status: 200, body: JSON.stringify(body) };
};

/** A fake Ghost with three newsletters, one archived. */
function busyGhost() {
  const ghost = new FakeGhost();
  ghost.newsletters.push(
    { id: '6a00000000000000000000a2', name: 'Members only', status: 'active', count: 0 },
    { id: '6a00000000000000000000a3', name: 'Old', status: 'archived', count: 0 },
  );
  ghost.addMember();
  ghost.addPost();
  return ghost.request;
}

async function discover(language, request) {
  const gladys = createFakeGladys({
    config: { url: 'http://192.0.2.10:2368', admin_api_key: ADMIN_KEY, language },
  });
  const app = registerHandlers(gladys, {
    store: new Store(mkdtempSync(join(tmpdir(), 'gladys-ghost-rules-'))),
    timers: false,
    request,
  });
  await gladys.connect();
  await app.ready;
  await app.stop();
  assert.equal(gladys.fake.connectionStatus.connected, true);
  return gladys.fake.discoveredDevices;
}

const scenarios = [
  { label: 'Ghost 6.77, English names', language: 'en', request: replay, count: 4 },
  { label: 'three newsletters, French names', language: 'fr', request: busyGhost(), count: 5 },
  { label: 'Ghost 6.77, German names', language: 'de', request: replay, count: 4 },
  { label: 'three newsletters, Spanish names', language: 'es', request: busyGhost(), count: 5 },
];

for (const scenario of scenarios) {
  test(`every discovered device follows the Gladys rules (${scenario.label})`, async () => {
    const devices = await discover(scenario.language, scenario.request);
    assert.equal(devices.length, scenario.count, 'site, members, posts, active newsletters');
    assert.equal(
      new Set(devices.map((device) => device.external_id)).size,
      devices.length,
      'unique device external ids',
    );

    for (const device of devices) {
      const where = device.name;

      // should_poll: true if and only if poll_frequency is provided, in ms.
      if (device.poll_frequency === undefined) {
        assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
      } else {
        assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
        assert.ok(
          table.poll_frequencies_ms.includes(device.poll_frequency),
          `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
        );
      }

      assert.ok(device.features.length > 0, `${where}: no feature`);
      const externalIds = new Set();
      const names = new Set();
      for (const feature of device.features) {
        const at = `${where} / ${feature.name}`;
        const pair = table.pairs[`${feature.category}/${feature.type}`];
        assert.ok(pair, `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`);
        assert.ok(
          pair.label_en && pair.label_fr && pair.icon,
          `${at}: couple without label or icon`,
        );

        assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
        assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
        assert.ok(
          Number.isFinite(feature.min) && Number.isFinite(feature.max),
          `${at}: finite min/max`,
        );
        assert.ok(feature.min <= feature.max, `${at}: min > max`);
        assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
        assert.equal(
          typeof feature.has_feedback,
          'boolean',
          `${at}: has_feedback must be a boolean`,
        );
        if (feature.unit !== undefined) {
          assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
        }

        assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
        externalIds.add(feature.external_id);
        assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
        names.add(feature.name);
      }
    }
  });
}
