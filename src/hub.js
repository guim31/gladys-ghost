// -----------------------------------------------------------------------------
// The Ghost hub: the blog read on a timer of the container (the interval
// chosen in the configuration); the states of the added devices published
// when they change, the scene events fired for new members and new posts, and
// the views the widget and the scene action read.
//
// Gladys never polls these devices (should_poll: false): the interval goes up
// to 30 minutes, beyond the fixed list of the core scheduler, and the scene
// events fire whether the devices are added to Gladys or not.
//
// Nine requests per cycle (src/ghost/client.js), whatever the size of the blog.
//
// The newest member and post already seen are kept in /data (src/store.js):
// a restart neither announces them twice nor misses one that came meanwhile.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { DEVICE_TYPES, blogValues, buildDevices, deviceIds, parseDeviceId } from './devices.js';
import { GhostClient, GhostError } from './ghost/client.js';
import { hostOf, missingCredentials, normalizeConfig } from './config.js';
import { ProblemLog } from './problems.js';
import { CONNECTION_TEXT, ERROR_TEXT, REPORT_TEXT, labelled, pick } from './texts.js';

const logger = createLogger({ name: 'ghost-hub' });

export const WIDGET_KEY = 'ghost_overview';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  NEW_MEMBER: 'new_member',
  POST_PUBLISHED: 'post_published',
});

export const HUB_TIMINGS = {
  // An unchanged value is sent again this often: Gladys shows "no recent
  // value" after 48 hours.
  heartbeatMs: 12 * 3600_000,
  // A scene action reads Ghost again when the last read is older.
  freshMs: 15_000,
};

/**
 * The newest items already seen: the newest date, and the ids at that date
 * (Ghost dates have one-second precision: two members can share one).
 */
export function advanceMarker(marker, items, dateOf) {
  let at = marker.at;
  for (const item of items) {
    at = Math.max(at, dateOf(item));
  }
  const ids = new Set(at === marker.at ? marker.ids : []);
  for (const item of items) {
    if (dateOf(item) === at) {
      ids.add(item.id);
    }
  }
  return { at, ids: [...ids].slice(-50) };
}

/** The items newer than the marker, oldest first. */
export function newerThan(marker, items, dateOf) {
  return items
    .filter(
      (item) =>
        dateOf(item) > marker.at || (dateOf(item) === marker.at && !marker.ids.includes(item.id)),
    )
    .sort((a, b) => dateOf(a) - dateOf(b));
}

// The SDK refuses a scene event string longer than this.
const MAX_EVENT_TEXT = 1000;

/** A marker read from /data, whatever its state. */
function marker(raw) {
  const at = Number.isFinite(raw?.at) ? raw.at : 0;
  const ids = Array.isArray(raw?.ids) ? raw.ids.filter((id) => typeof id === 'string') : [];
  return { at, ids };
}

const memberDate = (member) => member.createdAt;
const postDate = (post) => post.publishedAt;

/** A failed action: Gladys shows the message in red, in the user's language. */
export class ActionFailure extends Error {
  constructor(text) {
    super(text.en);
    this.message = text;
  }
}

export class GhostHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/ghost/client.js)
   * @param {boolean} [options.timers] the reading timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, store, request, timers = true, timings, now }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    // Defaults until start(): a handler reached after a failed start still
    // answers with a readable message.
    this.config = normalizeConfig({});
    this.client = null;
    this.signature = null;
    /** The last successful read: { key, site, members, posts, newsletters } */
    this.blog = null;
    this.readAt = 0;
    this.error = null;
    this.polling = null;
    this.transports = new Map();
    this.connection = null;
    this.discovered = null;
    this.saved = { blogs: {}, keys: {} };
    this.pollTimer = null;
    this.stopped = false;
    this.problems = new ProblemLog(logger);
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    const object = (value) => (value && typeof value === 'object' ? value : {});
    this.saved = { blogs: object(saved?.blogs), keys: object(saved?.keys) };
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates?.();
    this.transports.clear();
    this.connection = null;
    this.discovered = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    const previous = this.config;
    const languageChanged = this.signature !== null && previous.language !== config.language;
    this.config = config;
    const signature = JSON.stringify([config.url, config.key]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.client =
        missingCredentials(config) === null
          ? new GhostClient({
              url: config.url,
              key: config.key,
              request: this.request,
              now: this.now,
            })
          : null;
      this.blog = null;
      this.readAt = 0;
      this.error = null;
      this.polling = null;
    }
    if (languageChanged) {
      this.discovered = null; // new names for the Discovery tab
      this.gladys.forgetPublishedStates?.(); // the date text changes language
    }
    try {
      if (this.client) {
        await this.pollNow({ publish: true });
      } else {
        await this.afterChanges(true, { publish: true });
      }
    } finally {
      this.schedulePoll();
    }
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    await this.store.flush();
  }

  schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      try {
        await this.pollNow();
        this.problems.recover('poll', 'Reading Ghost works again');
      } catch (err) {
        this.problems.fail('poll', `Poll failed: ${err.message}`, 'error');
      }
      this.schedulePoll();
    }, this.config.pollIntervalMs);
  }

  // --- Reading Ghost -----------------------------------------------------------

  /** Read Ghost now and publish what changed. */
  async pollNow({ publish = false } = {}) {
    const changed = await this.poll();
    await this.afterChanges(changed, { publish });
  }

  /** Read again when the last read failed or is older than `freshMs` (scene action). */
  async refreshIfStale() {
    if (this.client && (this.error || this.now() - this.readAt >= this.timings.freshMs)) {
      await this.pollNow();
    }
  }

  /**
   * Read Ghost and apply what changed. Concurrent calls share the read.
   * @returns {Promise<boolean>} whether the widget shows something new
   */
  poll() {
    if (!this.client) {
      return Promise.resolve(false);
    }
    if (!this.polling) {
      const polling = this.read(this.client).finally(() => {
        if (this.polling === polling) {
          this.polling = null;
        }
      });
      this.polling = polling;
    }
    return this.polling;
  }

  async read(client) {
    let snapshot;
    try {
      snapshot = await client.snapshot();
    } catch (err) {
      if (!(err instanceof GhostError)) {
        throw err;
      }
      return client === this.client && this.applyFailure(err);
    }
    return client === this.client && this.applySuccess(snapshot);
  }

  async applySuccess(snapshot) {
    const firstRead = this.readAt === 0 || !this.blog;
    const wasError = this.error !== null;
    if (wasError) {
      logger.info('Ghost answers again');
    }
    // The site uuid names the devices (an old Ghost without it, the address),
    // kept per address: the ids never change, and a restart with Ghost down
    // still knows which devices go offline.
    const key = this.saved.keys[this.config.url] || snapshot.site.uuid || hostOf(this.config.url);
    const keyIsNew = this.saved.keys[this.config.url] !== key;
    this.saved.keys[this.config.url] = key;
    const blog = { key, ...snapshot };
    if (firstRead) {
      logger.info(
        `Ghost ${blog.site.version} (${hostOf(this.config.url)}): ` +
          `${blog.members.total} member(s), ${blog.posts.published} published post(s)`,
      );
    }
    const before = JSON.stringify(widgetSignature(this.blog));
    this.blog = blog;
    this.error = null;
    this.readAt = this.now();
    if ((await this.transition(blog)) || keyIsNew) {
      this.store.save(this.saved);
    }
    return firstRead || wasError || JSON.stringify(widgetSignature(blog)) !== before;
  }

  applyFailure(err) {
    const wasError = this.error?.kind;
    this.error = { kind: err.kind, message: err.message };
    this.readAt = this.now();
    if (wasError !== err.kind) {
      logger.warn(`Ghost: ${err.message}`);
    }
    return wasError !== err.kind;
  }

  /**
   * Compare the newest members and posts with what the triggers remember;
   * fire the scene events. The first sight of a blog only records them.
   * @returns {Promise<boolean>} whether the saved state changed
   */
  async transition(blog) {
    const saved = this.saved.blogs[blog.key];
    const before = JSON.stringify(saved ?? null);
    const member = marker(saved?.member);
    const post = marker(saved?.post);
    const next = {
      member: advanceMarker(member, blog.members.recent, memberDate),
      post: advanceMarker(post, blog.posts.recent, postDate),
    };
    if (saved) {
      // An event Gladys cannot take now (restarting, overloaded) keeps the
      // marker just before it: the rest is announced at the next reading,
      // nothing twice. One refused for good is skipped.
      const announce = async (current, items, dateOf, key, dataOf) => {
        let reached = current;
        for (const item of newerThan(current, items, dateOf)) {
          if ((await this.fire(key, dataOf(item))) === 'retry') {
            return reached;
          }
          reached = advanceMarker(reached, [item], dateOf);
        }
        return advanceMarker(current, items, dateOf);
      };
      next.member = await announce(
        member,
        blog.members.recent,
        memberDate,
        TRIGGERS.NEW_MEMBER,
        (item) => ({ name: item.name, email: item.email, status: item.status }),
      );
      next.post = await announce(
        post,
        blog.posts.recent,
        postDate,
        TRIGGERS.POST_PUBLISHED,
        (item) => ({ title: item.title, url: item.url }),
      );
    }
    this.saved.blogs[blog.key] = next;
    return JSON.stringify(next) !== before;
  }

  /** @returns {Promise<'ok'|'retry'|'skip'>} 'retry' when Gladys may take it later */
  async fire(key, extra) {
    logger.debug(`Scene event ${key}`);
    const data = { blog: this.blogName(), ...extra };
    for (const [name, value] of Object.entries(data)) {
      data[name] = value.slice(0, MAX_EVENT_TEXT); // the SDK refuses longer strings
    }
    try {
      await this.gladys.publishSceneEvent(key, data);
      this.problems.recover(`event-${key}`, `Scene event ${key} accepted again`);
      return 'ok';
    } catch (err) {
      this.problems.fail(`event-${key}`, `Scene event ${key} refused: ${err.message}`);
      const status = Number(err.status);
      return !status || status === 429 || status >= 500 ? 'retry' : 'skip';
    }
  }

  // --- Publishing to Gladys ----------------------------------------------------

  isCreated(externalId) {
    return (this.gladys.devices ?? []).some((device) => device.external_id === externalId);
  }

  /** The key of the blog at the configured address: read, or remembered in /data. */
  blogKey() {
    return this.blog?.key ?? this.saved.keys[this.config.url] ?? null;
  }

  /**
   * The device external ids to badge: the blog last read; before any
   * successful read, the added devices of the integration.
   */
  deviceIdsOfBlog() {
    if (this.blog) {
      return buildDevices(this.gladys, this.blog, this.config.language).map((d) => d.external_id);
    }
    return (this.gladys.devices ?? []).map((d) => d.external_id).filter((id) => this.owns(id));
  }

  /** Publish the Discovery list when it changed (a newsletter added, a title…). */
  async publishDevices({ force = false } = {}) {
    let devices;
    if (!this.client) {
      devices = [];
    } else if (!this.blog || this.error) {
      return; // nothing read: keep the list Gladys has
    } else {
      devices = buildDevices(this.gladys, this.blog, this.config.language);
    }
    const key = JSON.stringify(devices);
    if (!force && key === this.discovered) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.discovered = key;
      this.problems.recover('discovered', 'Discovered devices accepted again');
    } catch (err) {
      this.problems.fail('discovered', `Discovered devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab: read again, publish the list. */
  async rediscover() {
    await this.poll();
    await this.afterChanges(true, { publish: true });
  }

  /**
   * The user added (or updated) a device: send all its states (the SDK forgot
   * what it had published for it), and its badge.
   */
  async onDeviceCreated(device) {
    this.transports.delete(device.external_id);
    await this.publishStates();
    await this.publishTransports();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  /** Gladys asks for a refresh (onPoll, only if it polls anyway). */
  async pollDevice() {
    await this.pollNow();
  }

  /**
   * The states of the added devices. The SDK skips the values Gladys already
   * has (and sends an unchanged one again after `heartbeatMs`). Ghost not
   * answering: the site goes offline, the counters keep their last value.
   */
  async publishStates() {
    const key = this.blogKey();
    if (!this.blog && !(this.error && key)) {
      return;
    }
    // Ghost down since the start: only the site, offline.
    const blog = this.blog ?? { key };
    const values = blogValues(this.gladys, { ...blog, error: this.error }, this.config.language);
    const states = [];
    for (const [externalId, list] of values) {
      if (this.isCreated(externalId)) {
        states.push(...list);
      }
    }
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeatMs });
      this.problems.recover('states', 'States accepted again');
    } catch (err) {
      this.problems.fail('states', `States refused: ${err.message}`);
    }
  }

  async afterChanges(widgetChanged, { publish = false } = {}) {
    await this.publishDevices({ force: publish });
    await this.publishStates();
    await this.publishTransports();
    await this.publishConnectionStatus();
    if (widgetChanged) {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  /** The badge of the added devices: local, or unreachable. */
  async publishTransports() {
    if (!this.client || (!this.blog && !this.error)) {
      return;
    }
    const transport = this.error ? DEVICE_TRANSPORTS.UNREACHABLE : DEVICE_TRANSPORTS.LOCAL;
    const entries = this.deviceIdsOfBlog()
      .filter((id) => this.isCreated(id) && this.transports.get(id) !== transport)
      .map((id) => ({ external_id: id, transport }));
    if (entries.length === 0) {
      return;
    }
    try {
      await this.gladys.publishTransports(entries);
      for (const entry of entries) {
        this.transports.set(entry.external_id, entry.transport);
      }
      this.problems.recover('transports', 'Transports accepted again');
    } catch (err) {
      this.problems.fail('transports', `Transports refused: ${err.message}`);
    }
  }

  /** The status under the integration name. */
  connectionStatus() {
    const missing = missingCredentials(this.config);
    if (missing) {
      return { connected: false, message: CONNECTION_TEXT[missing] };
    }
    if (this.error) {
      return { connected: false, message: ERROR_TEXT[this.error.kind] };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.problems.recover('connection', 'Connection status accepted again');
    } catch (err) {
      this.problems.fail('connection', `Connection status refused: ${err.message}`);
    }
  }

  // --- Views (widget, scene action, report) -------------------------------------

  /** The name of a device in Gladys (the user may have renamed it), else `fallback`. */
  deviceName(type, id, fallback) {
    const externalId = deviceIds(this.gladys, type, id).device;
    const device = (this.gladys.devices ?? []).find((d) => d.external_id === externalId);
    return device?.name || fallback;
  }

  /** The blog name shown: the site device's name in Gladys, else the Ghost title. */
  blogName() {
    if (!this.blog) {
      return 'Ghost';
    }
    return this.deviceName(DEVICE_TYPES.SITE, this.blog.key, this.blog.site.title);
  }

  /** Whether a device external id belongs to the integration. */
  owns(externalId) {
    return parseDeviceId(this.gladys, externalId) !== null;
  }

  /** Throws the reason Ghost cannot answer, if any. */
  assertReadable() {
    const status = this.connectionStatus();
    if (!status.connected) {
      throw new Error(pick(status.message, this.config.language));
    }
  }

  /** "Test the connection": read Ghost now, one line. */
  async testConnection() {
    await this.pollNow({ publish: true });
    const message = {};
    const status = this.connectionStatus();
    if (!status.connected || !this.blog) {
      // A failure is thrown: Gladys shows it in red.
      for (const language of Object.keys(REPORT_TEXT)) {
        message[language] = pick(status.message ?? ERROR_TEXT.http, language);
      }
      throw new ActionFailure(message);
    }
    for (const [language, text] of Object.entries(REPORT_TEXT)) {
      const parts = [
        text.ok(this.blog.site.version),
        text.members(this.blog.members.total),
        text.posts(this.blog.posts.published),
      ];
      message[language] = labelled(this.blog.site.title, parts.join(', '), language);
    }
    logger.info('Connection tested');
    return message;
  }
}

/** What the widget shows of a blog: it is refreshed when this changes. */
const widgetSignature = (blog) =>
  blog && [
    blog.site.title,
    blog.members.total,
    blog.members.paid,
    blog.members.new7d,
    blog.posts.published,
    blog.posts.recent[0]?.id,
    blog.posts.recent[0]?.title,
  ];
