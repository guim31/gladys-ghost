// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Ghost, a temporary
// /data and a manual clock, with the integration wired on top through
// registerHandlers. No timer runs: the tests read Ghost with
// `world.hub.pollNow()`. (Adapted from guim31/gladys-umami.)
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { deviceIds } from '../../src/devices.js';
import { Store } from '../../src/store.js';
import { ADMIN_KEY, BASE, FakeGhost, SITE_UUID } from './fakeGhost.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';
// Dates are shown in the time zone of Gladys: fixed here.
process.env.TZ = 'Europe/Paris';

/** A manual clock, shared by the hub, the fake Ghost and the tests: 15/10/2026, 10:00 UTC. */
export function createClock(start = Date.UTC(2026, 9, 15, 10, 0, 0)) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export async function createWorld({
  clock = createClock(),
  ghost,
  config = { url: BASE, admin_api_key: ADMIN_KEY, language: 'en' },
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-ghost-')),
  timers = false,
  seed = true,
} = {}) {
  const fakeGhost = ghost ?? new FakeGhost({ now: clock.now });
  if (!ghost && seed) {
    const day = 86_400_000;
    fakeGhost.addMember({ name: 'Ada', at: clock.now() - 30 * day });
    fakeGhost.addMember({ name: 'Grace', status: 'paid', at: clock.now() - 3 * day });
    fakeGhost.addMember({ name: 'Linus', at: clock.now() - 3600_000 });
    fakeGhost.addPost({ title: 'First post', at: clock.now() - 10 * day });
    fakeGhost.addPost({ title: 'Hello world', at: clock.now() - day });
    fakeGhost.addPost({ title: 'Work in progress', status: 'draft' });
    fakeGhost.addPost({ title: 'Coming soon', status: 'scheduled', at: clock.now() + day });
  }
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: fakeGhost.request,
    timers,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, ghost: fakeGhost, app, hub: app.hub, clock, dataDir };
}

/** External ids of a device of the blog: 'site', 'members', 'posts'. */
export const idsOf = (world, type, id = SITE_UUID) => deviceIds(world.gladys, type, id);

/** Add discovered devices in Gladys, as the user would (all by default). */
export async function createDevices(world, filter = () => true) {
  for (const device of world.fake.discoveredDevices.filter(filter)) {
    await world.fake.deviceCreated(device);
  }
}

export { ADMIN_KEY, BASE, FakeGhost, SITE_UUID };
