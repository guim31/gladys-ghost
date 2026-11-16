// -----------------------------------------------------------------------------
// The hub against the SDK's fake Gladys and a fake Ghost: discovery, states,
// scene triggers, persistence across restarts, errors, quiet logs, the
// widget, the scene action and the reading timer of the container.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { FEATURE_KEYS } from '../src/devices.js';
import { TRIGGERS, WIDGET_KEY, advanceMarker, newerThan } from '../src/hub.js';
import {
  ADMIN_KEY,
  BASE,
  FakeGhost,
  createClock,
  createDevices,
  createWorld,
  idsOf,
} from './helpers/world.js';

const events = (world, key) => world.fake.sceneEvents.filter((event) => event.key === key);
const MINUTE = 60_000;

test('four devices proposed in Discovery, nothing polled by Gladys', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const devices = world.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((d) => d.name),
    ['My Blog', 'My Blog – Members', 'My Blog – Posts', 'My Blog – Newsletter Weekly'],
  );
  for (const device of devices) {
    assert.equal(device.should_poll, false);
    assert.equal(device.poll_frequency, undefined);
  }
  assert.equal(world.fake.states.length, 0, 'nothing published for devices not added');
  assert.equal(world.fake.connectionStatus.connected, true);
});

test('the states of the added devices, at once, then only the changes', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  const members = idsOf(world, 'members');
  const posts = idsOf(world, 'posts');
  const site = idsOf(world, 'site');
  const last = (ids, key) => world.fake.lastState(ids.feature(key));
  assert.equal(last(site, FEATURE_KEYS.ONLINE), 1);
  assert.equal(last(site, FEATURE_KEYS.VERSION), '6.77');
  assert.equal(last(members, FEATURE_KEYS.TOTAL), 3);
  assert.equal(last(members, FEATURE_KEYS.FREE), 2);
  assert.equal(last(members, FEATURE_KEYS.PAID), 1);
  assert.equal(last(members, FEATURE_KEYS.NEW_24H), 1);
  assert.equal(last(members, FEATURE_KEYS.NEW_7D), 2);
  assert.equal(last(posts, FEATURE_KEYS.PUBLISHED), 2);
  assert.equal(last(posts, FEATURE_KEYS.DRAFTS), 1);
  assert.equal(last(posts, FEATURE_KEYS.SCHEDULED), 1);
  assert.equal(last(posts, FEATURE_KEYS.LATEST_TITLE), 'Hello world');
  assert.equal(last(posts, FEATURE_KEYS.LATEST_DATE), '14/10/2026, 12:00');
  assert.deepEqual([...new Set(world.fake.transports.map((entry) => entry.transport))], ['local']);

  const before = world.fake.states.length;
  world.clock.advance(MINUTE);
  await world.hub.pollNow();
  assert.equal(world.fake.states.length, before, 'nothing changed, nothing sent');

  world.ghost.addMember({ name: 'Margaret' });
  world.clock.advance(MINUTE);
  await world.hub.pollNow();
  assert.equal(last(members, FEATURE_KEYS.TOTAL), 4);
  assert.equal(last(members, FEATURE_KEYS.NEW_24H), 2);
});

test('a new member fires the trigger once, with its plan; the first reading fires nothing', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.equal(world.fake.sceneEvents.length, 0, 'existing members are not announced');

  world.clock.advance(MINUTE);
  world.ghost.addMember({ name: 'Margaret', status: 'paid' });
  world.ghost.addMember({ name: 'Ken' }); // same second
  world.clock.advance(MINUTE);
  await world.hub.pollNow();
  await world.hub.pollNow();
  assert.deepEqual(
    events(world, TRIGGERS.NEW_MEMBER).map((e) => e.data),
    [
      { blog: 'My Blog', name: 'Margaret', email: 'margaret@example.com', status: 'paid' },
      { blog: 'My Blog', name: 'Ken', email: 'ken@example.com', status: 'free' },
    ],
  );
});

test('a published post fires the trigger, a scheduled one when it goes out', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.clock.advance(MINUTE);
  world.ghost.addPost({ title: 'Fresh news' });
  await world.hub.pollNow();
  assert.deepEqual(
    events(world, TRIGGERS.POST_PUBLISHED).map((e) => e.data),
    [{ blog: 'My Blog', title: 'Fresh news', url: 'https://blog.example.org/fresh-news/' }],
  );
  // Ghost publishes the scheduled post at its date.
  const scheduled = world.ghost.posts.find((p) => p.status === 'scheduled');
  world.clock.advance(86_400_000);
  scheduled.status = 'published';
  await world.hub.pollNow();
  assert.deepEqual(
    events(world, TRIGGERS.POST_PUBLISHED).map((e) => e.data.title),
    ['Fresh news', 'Coming soon'],
  );
});

test('a restart neither repeats an announcement nor misses what came meanwhile', async (t) => {
  const clock = createClock();
  const ghost = new FakeGhost({ now: clock.now });
  ghost.addMember({ name: 'Ada', at: clock.now() - 86_400_000 });
  const first = await createWorld({ clock, ghost });
  first.clock.advance(MINUTE);
  ghost.addMember({ name: 'Grace' });
  await first.hub.pollNow();
  assert.equal(events(first, TRIGGERS.NEW_MEMBER).length, 1);
  await first.app.stop();

  clock.advance(MINUTE);
  ghost.addMember({ name: 'Linus' });
  ghost.addPost({ title: 'While away' });
  const second = await createWorld({ clock, ghost, dataDir: first.dataDir });
  t.after(() => second.app.stop());
  assert.deepEqual(
    events(second, TRIGGERS.NEW_MEMBER).map((e) => e.data.name),
    ['Linus'],
  );
  assert.deepEqual(
    events(second, TRIGGERS.POST_PUBLISHED).map((e) => e.data.title),
    ['While away'],
  );
});

test('the markers: same-second items told apart by id, oldest first', () => {
  const at = (item) => item.at;
  const marker = advanceMarker(
    { at: 0, ids: [] },
    [
      { id: 'a', at: 5 },
      { id: 'b', at: 5 },
    ],
    at,
  );
  assert.deepEqual(marker, { at: 5, ids: ['a', 'b'] });
  const items = [
    { id: 'd', at: 7 },
    { id: 'c', at: 5 },
    { id: 'b', at: 5 },
  ];
  assert.deepEqual(
    newerThan(marker, items, at).map((i) => i.id),
    ['c', 'd'],
  );
  assert.deepEqual(advanceMarker(marker, items, at), { at: 7, ids: ['d'] });
});

test('Ghost down: the site goes offline, unreachable badge, status, then back', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  const site = idsOf(world, 'site');
  world.ghost.down = true;
  world.clock.advance(MINUTE);
  await world.hub.pollNow();
  assert.equal(world.fake.lastState(site.feature(FEATURE_KEYS.ONLINE)), 0);
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.equal(world.fake.connectionStatus.message.fr, 'Ghost ne répond pas');
  assert.equal(world.fake.transports.at(-1).transport, 'unreachable');
  assert.equal(
    world.fake.lastState(idsOf(world, 'members').feature(FEATURE_KEYS.TOTAL)),
    3,
    'counters keep their last value',
  );

  world.ghost.down = false;
  world.clock.advance(MINUTE);
  await world.hub.pollNow();
  assert.equal(world.fake.lastState(site.feature(FEATURE_KEYS.ONLINE)), 1);
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.equal(world.fake.transports.at(-1).transport, 'local');
});

test('a refused key, a Content API key, a missing address: a readable status', async (t) => {
  const refused = await createWorld();
  t.after(() => refused.app.stop());
  refused.ghost.status = 401;
  await refused.hub.pollNow();
  assert.match(refused.fake.connectionStatus.message.en, /Admin API key refused/);
  // A failed test is an error, shown in red, in every language.
  const failed = await refused.fake.action('test_connection', {});
  assert.equal(failed.success, false);
  assert.match(failed.error.en, /Admin API key refused/);
  assert.deepEqual(Object.keys(failed.error), ['en', 'fr', 'de', 'es']);
  assert.deepEqual(Object.keys(refused.fake.connectionStatus.message), ['en', 'fr', 'de', 'es']);

  const content = await createWorld({
    config: { url: BASE, admin_api_key: '0123456789abcdef01234567' },
  });
  t.after(() => content.app.stop());
  assert.match(content.fake.connectionStatus.message.en, /not an Admin API key/);
  assert.equal(content.ghost.requests.length, 0);
  const ack = await content.fake.sceneAction('get_blog_stats', {});
  assert.equal(ack.success, false);

  const empty = await createWorld({ config: {} });
  t.after(() => empty.app.stop());
  assert.equal(empty.fake.connectionStatus.connected, false);
  assert.deepEqual(empty.fake.discoveredDevices, []);
});

test('the widget: four tiles, the latest post, a Refresh button, hideable', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'fr' });
  assert.equal(ack.success, true, ack.error);
  const content = ack.data.content;
  validateWidgetContent(content);
  assert.deepEqual(
    content.components.map((c) => c.type),
    ['value', 'value', 'value', 'value', 'text', 'button'],
  );
  assert.equal(content.components[0].label, 'Membres');
  assert.equal(content.components[4].text, 'Dernier article : Hello world (14/10/2026 12:00)');

  const bare = await world.fake.widgetGet(WIDGET_KEY, {
    settings: { show_latest: false, show_refresh: false },
    language: 'en',
  });
  assert.deepEqual(
    bare.data.content.components.map((c) => c.type),
    ['value', 'value', 'value', 'value'],
  );

  const refreshed = await world.fake.widgetAction(WIDGET_KEY, 'refresh', {});
  assert.equal(refreshed.success, true, refreshed.error);

  world.ghost.down = true;
  await world.hub.pollNow();
  const down = await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'en' });
  validateWidgetContent(down.data.content);
  assert.ok(down.data.content.components.some((c) => c.text === 'Ghost does not answer'));
});

test('the scene action: figures and a sentence, the blog named as in Gladys', async (t) => {
  const world = await createWorld({
    config: { url: BASE, admin_api_key: ADMIN_KEY, language: 'fr' },
  });
  t.after(() => world.app.stop());
  await createDevices(world);
  const site = world.gladys.devices.find((d) => d.external_id === idsOf(world, 'site').device);
  site.name = 'Mon blog';
  const ack = await world.fake.sceneAction('get_blog_stats', {});
  assert.equal(ack.success, true, ack.error);
  assert.equal(
    ack.data.outputs.sentence,
    'Mon blog : 3 membre(s), dont 1 payant(s), 1 nouveau(x) en 24 h, 2 en 7 jours, ' +
      'dernier article « Hello world » le 14/10/2026 12:00.',
  );
});

test('a normal reading cycle writes nothing at info level', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  const lines = [];
  const write = process.stdout.write;
  const level = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'info';
  process.stdout.write = (chunk) => {
    lines.push(String(chunk));
    return true;
  };
  try {
    world.clock.advance(MINUTE);
    await world.hub.pollNow();
    world.clock.advance(MINUTE);
    await world.hub.pollNow();
  } finally {
    process.stdout.write = write;
    process.env.LOG_LEVEL = level;
  }
  assert.deepEqual(lines, []);
});

test('the container reads Ghost on its own timer, Gladys never polls', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const world = await createWorld({ timers: true });
  t.after(() => world.app.stop());
  const before = world.ghost.requests.length;
  t.mock.timers.tick(300_000);
  // Let the reading run.
  for (let i = 0; i < 50; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(world.ghost.requests.length, before + 9);
});

test('Ghost down from the start: the added devices go offline, by the remembered key', async (t) => {
  const first = await createWorld();
  await createDevices(first);
  await first.app.stop();
  const devices = first.gladys.devices.map((d) => ({ ...d }));

  const ghost = new FakeGhost({ now: first.clock.now });
  ghost.down = true;
  const second = await createWorld({ clock: first.clock, ghost, devices, dataDir: first.dataDir });
  t.after(() => second.app.stop());
  assert.equal(second.fake.lastState(idsOf(second, 'site').feature(FEATURE_KEYS.ONLINE)), 0);
  assert.deepEqual(
    [...new Set(second.fake.transports.map((entry) => entry.transport))],
    ['unreachable'],
  );
  assert.equal(second.fake.connectionStatus.connected, false);
});

test('a scene event refused by Gladys is announced at the next reading, and texts are cut', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.clock.advance(MINUTE);
  world.ghost.addMember({ name: 'M'.repeat(1500) });
  world.ghost.addPost({ title: 'P'.repeat(1500) });
  const publish = world.gladys.publishSceneEvent.bind(world.gladys);
  world.gladys.publishSceneEvent = async () => {
    throw new Error('Gladys restarting');
  };
  await world.hub.pollNow();
  assert.equal(world.fake.sceneEvents.length, 0);
  world.gladys.publishSceneEvent = publish;
  await world.hub.pollNow();
  await world.hub.pollNow();
  const fired = world.fake.sceneEvents;
  assert.deepEqual(
    fired.map((e) => e.key),
    [TRIGGERS.NEW_MEMBER, TRIGGERS.POST_PUBLISHED],
  );
  assert.equal(fired[0].data.name.length, 255, 'Ghost texts are cut at 255');
  assert.equal(fired[1].data.url.length, 1000, 'the SDK refuses more than 1000');
});

test('Refresh without configuration says what is missing', async (t) => {
  const world = await createWorld({ config: {} });
  t.after(() => world.app.stop());
  const ack = await world.fake.widgetAction(WIDGET_KEY, 'refresh', {});
  assert.equal(ack.success, true, ack.error);
  assert.match(ack.data.message.en, /Fill in your Ghost blog/);
});

test('a scene event refused for good is skipped, the next ones still go out', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.clock.advance(MINUTE);
  world.ghost.addMember({ name: 'Refused' });
  const publish = world.gladys.publishSceneEvent.bind(world.gladys);
  world.gladys.publishSceneEvent = async () => {
    throw Object.assign(new Error('Unknown trigger'), { status: 404 });
  };
  await world.hub.pollNow();
  world.gladys.publishSceneEvent = publish;
  world.clock.advance(MINUTE);
  world.ghost.addMember({ name: 'Next' });
  await world.hub.pollNow();
  assert.deepEqual(
    world.fake.sceneEvents.map((e) => e.data.name),
    ['Next'],
  );
});
