// -----------------------------------------------------------------------------
// Gladys devices, proposed in the Discovery tab (the user adds what they want
// to follow). Identified by the site uuid of the blog (`site_uuid`, kept by
// Ghost across restarts and address changes), the newsletters by their id.
//
//   site        online         input/binary            1 the Admin API answers, 0 otherwise
//               version        text/text               Ghost version, e.g. "6.77"
//   members     total          counter-sensor/integer  every member
//               free           counter-sensor/integer  free members
//               paid           counter-sensor/integer  paid members, complimentary included
//               new_24h        counter-sensor/integer  members who joined in the last 24 hours
//               new_7d         counter-sensor/integer  members who joined in the last 7 days
//   posts       published      counter-sensor/integer  published posts
//               drafts         counter-sensor/integer  drafts
//               scheduled      counter-sensor/integer  scheduled posts
//               latest_title   text/text               title of the newest published post
//               latest_date    text/text               its publication date, in the language
//                                                      and time zone of Gladys
//   newsletter  subscribers    counter-sensor/integer  members subscribed (active newsletters)
//
// Published with should_poll: false: the integration reads Ghost on its own
// timer (src/hub.js), at the interval chosen in the configuration.
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

export const MODEL = 'Ghost';

// Device types (external ids): permanent once published.
export const DEVICE_TYPES = Object.freeze({
  SITE: 'site',
  MEMBERS: 'members',
  POSTS: 'posts',
  NEWSLETTER: 'newsletter',
});

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  ONLINE: 'online',
  VERSION: 'version',
  TOTAL: 'total',
  FREE: 'free',
  PAID: 'paid',
  NEW_24H: 'new_24h',
  NEW_7D: 'new_7d',
  PUBLISHED: 'published',
  DRAFTS: 'drafts',
  SCHEDULED: 'scheduled',
  LATEST_TITLE: 'latest_title',
  LATEST_DATE: 'latest_date',
  SUBSCRIBERS: 'subscribers',
});

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.ONLINE]: 'Online',
    [FEATURE_KEYS.VERSION]: 'Ghost version',
    [FEATURE_KEYS.TOTAL]: 'Members',
    [FEATURE_KEYS.FREE]: 'Free members',
    [FEATURE_KEYS.PAID]: 'Paid members',
    [FEATURE_KEYS.NEW_24H]: 'New members (24 h)',
    [FEATURE_KEYS.NEW_7D]: 'New members (7 days)',
    [FEATURE_KEYS.PUBLISHED]: 'Published posts',
    [FEATURE_KEYS.DRAFTS]: 'Drafts',
    [FEATURE_KEYS.SCHEDULED]: 'Scheduled posts',
    [FEATURE_KEYS.LATEST_TITLE]: 'Latest post',
    [FEATURE_KEYS.LATEST_DATE]: 'Latest post date',
    [FEATURE_KEYS.SUBSCRIBERS]: 'Subscribers',
  },
  fr: {
    [FEATURE_KEYS.ONLINE]: 'En ligne',
    [FEATURE_KEYS.VERSION]: 'Version de Ghost',
    [FEATURE_KEYS.TOTAL]: 'Membres',
    [FEATURE_KEYS.FREE]: 'Membres gratuits',
    [FEATURE_KEYS.PAID]: 'Membres payants',
    [FEATURE_KEYS.NEW_24H]: 'Nouveaux membres (24 h)',
    [FEATURE_KEYS.NEW_7D]: 'Nouveaux membres (7 jours)',
    [FEATURE_KEYS.PUBLISHED]: 'Articles publiés',
    [FEATURE_KEYS.DRAFTS]: 'Brouillons',
    [FEATURE_KEYS.SCHEDULED]: 'Articles programmés',
    [FEATURE_KEYS.LATEST_TITLE]: 'Dernier article',
    [FEATURE_KEYS.LATEST_DATE]: 'Date du dernier article',
    [FEATURE_KEYS.SUBSCRIBERS]: 'Abonnés',
  },
  de: {
    [FEATURE_KEYS.ONLINE]: 'Online',
    [FEATURE_KEYS.VERSION]: 'Ghost-Version',
    [FEATURE_KEYS.TOTAL]: 'Mitglieder',
    [FEATURE_KEYS.FREE]: 'Kostenlose Mitglieder',
    [FEATURE_KEYS.PAID]: 'Zahlende Mitglieder',
    [FEATURE_KEYS.NEW_24H]: 'Neue Mitglieder (24 h)',
    [FEATURE_KEYS.NEW_7D]: 'Neue Mitglieder (7 Tage)',
    [FEATURE_KEYS.PUBLISHED]: 'Veröffentlichte Beiträge',
    [FEATURE_KEYS.DRAFTS]: 'Entwürfe',
    [FEATURE_KEYS.SCHEDULED]: 'Geplante Beiträge',
    [FEATURE_KEYS.LATEST_TITLE]: 'Neuester Beitrag',
    [FEATURE_KEYS.LATEST_DATE]: 'Datum des neuesten Beitrags',
    [FEATURE_KEYS.SUBSCRIBERS]: 'Abonnenten',
  },
  es: {
    [FEATURE_KEYS.ONLINE]: 'En línea',
    [FEATURE_KEYS.VERSION]: 'Versión de Ghost',
    [FEATURE_KEYS.TOTAL]: 'Miembros',
    [FEATURE_KEYS.FREE]: 'Miembros gratuitos',
    [FEATURE_KEYS.PAID]: 'Miembros de pago',
    [FEATURE_KEYS.NEW_24H]: 'Nuevos miembros (24 h)',
    [FEATURE_KEYS.NEW_7D]: 'Nuevos miembros (7 días)',
    [FEATURE_KEYS.PUBLISHED]: 'Artículos publicados',
    [FEATURE_KEYS.DRAFTS]: 'Borradores',
    [FEATURE_KEYS.SCHEDULED]: 'Artículos programados',
    [FEATURE_KEYS.LATEST_TITLE]: 'Último artículo',
    [FEATURE_KEYS.LATEST_DATE]: 'Fecha del último artículo',
    [FEATURE_KEYS.SUBSCRIBERS]: 'Suscriptores',
  },
};

// Device names: "<blog title> – <part>". A newsletter keeps its own name.
export const DEVICE_NAMES = {
  en: { members: 'Members', posts: 'Posts', newsletter: 'Newsletter' },
  fr: { members: 'Membres', posts: 'Articles', newsletter: 'Newsletter' },
  de: { members: 'Mitglieder', posts: 'Beiträge', newsletter: 'Newsletter' },
  es: { members: 'Miembros', posts: 'Artículos', newsletter: 'Newsletter' },
};

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

// Display bound of the counters (the core never applies it on write).
export const MAX_COUNT = 1_000_000_000;

export const deviceIds = (gladys, type, id) => gladys.externalIds(type, id);

/** `{ type, id }` of a device external id of ours, null otherwise. */
export function parseDeviceId(gladys, externalId) {
  if (typeof externalId !== 'string') {
    return null;
  }
  for (const type of Object.values(DEVICE_TYPES)) {
    const prefix = deviceIds(gladys, type, '').device;
    if (externalId.startsWith(prefix) && externalId.length > prefix.length) {
      return { type, id: externalId.slice(prefix.length) };
    }
  }
  return null;
}

const sensor = (name, externalId, category, type, extra) => ({
  name,
  external_id: externalId,
  category,
  type,
  read_only: true,
  has_feedback: false,
  ...extra,
});

const counter = (names, ids, key) =>
  sensor(
    names[key],
    ids.feature(key),
    DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    { keep_history: true, min: 0, max: MAX_COUNT },
  );

const textFeature = (names, ids, key) =>
  sensor(
    names[key],
    ids.feature(key),
    DEVICE_FEATURE_CATEGORIES.TEXT,
    DEVICE_FEATURE_TYPES.TEXT.TEXT,
    { keep_history: false, min: 0, max: 0 },
  );

const device = (name, ids, features) => ({
  name: name.slice(0, 255),
  external_id: ids.device,
  model: MODEL,
  should_poll: false,
  features,
});

/**
 * The discovery payloads of a blog read once.
 * @param {object} gladys
 * @param {{ key: string, site: object, newsletters: object[] }} blog
 * @param {string} language
 */
export function buildDevices(gladys, blog, language = 'en') {
  const names = NAMES[language] ?? NAMES.en;
  const parts = DEVICE_NAMES[language] ?? DEVICE_NAMES.en;
  const title = blog.site.title;
  const site = deviceIds(gladys, DEVICE_TYPES.SITE, blog.key);
  const members = deviceIds(gladys, DEVICE_TYPES.MEMBERS, blog.key);
  const posts = deviceIds(gladys, DEVICE_TYPES.POSTS, blog.key);
  return [
    device(title, site, [
      sensor(
        names[FEATURE_KEYS.ONLINE],
        site.feature(FEATURE_KEYS.ONLINE),
        DEVICE_FEATURE_CATEGORIES.INPUT,
        DEVICE_FEATURE_TYPES.SENSOR.BINARY,
        { keep_history: true, min: 0, max: 1 },
      ),
      textFeature(names, site, FEATURE_KEYS.VERSION),
    ]),
    device(`${title} – ${parts.members}`, members, [
      counter(names, members, FEATURE_KEYS.TOTAL),
      counter(names, members, FEATURE_KEYS.FREE),
      counter(names, members, FEATURE_KEYS.PAID),
      counter(names, members, FEATURE_KEYS.NEW_24H),
      counter(names, members, FEATURE_KEYS.NEW_7D),
    ]),
    device(`${title} – ${parts.posts}`, posts, [
      counter(names, posts, FEATURE_KEYS.PUBLISHED),
      counter(names, posts, FEATURE_KEYS.DRAFTS),
      counter(names, posts, FEATURE_KEYS.SCHEDULED),
      textFeature(names, posts, FEATURE_KEYS.LATEST_TITLE),
      textFeature(names, posts, FEATURE_KEYS.LATEST_DATE),
    ]),
    ...blog.newsletters.map((newsletter) =>
      device(
        `${title} – ${parts.newsletter} ${newsletter.name}`,
        deviceIds(gladys, DEVICE_TYPES.NEWSLETTER, newsletter.id),
        [
          counter(
            names,
            deviceIds(gladys, DEVICE_TYPES.NEWSLETTER, newsletter.id),
            FEATURE_KEYS.SUBSCRIBERS,
          ),
        ],
      ),
    ),
  ];
}

/** A date in the language of the configuration and the time zone of Gladys (TZ). */
export function formatDate(ms, language) {
  return new Intl.DateTimeFormat(LOCALES[language] ?? LOCALES.en, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(ms));
}

/** A feature text: never empty, at most 255 characters. */
export const featureText = (value) => (value ? String(value).slice(0, 255) : '-');

/**
 * The states of a blog: `{ device_feature_external_id, state|text }`, per
 * device external id. `blog.error` set: only the site is offline.
 */
export function blogValues(gladys, blog, language = 'en') {
  const site = deviceIds(gladys, DEVICE_TYPES.SITE, blog.key);
  const values = new Map();
  const add = (ids, list) =>
    values.set(
      ids.device,
      list.map(({ key, ...value }) => ({ device_feature_external_id: ids.feature(key), ...value })),
    );
  if (blog.error) {
    add(site, [{ key: FEATURE_KEYS.ONLINE, state: 0 }]);
    return values;
  }
  add(site, [
    { key: FEATURE_KEYS.ONLINE, state: 1 },
    { key: FEATURE_KEYS.VERSION, text: featureText(blog.site.version) },
  ]);
  const { members, posts } = blog;
  add(deviceIds(gladys, DEVICE_TYPES.MEMBERS, blog.key), [
    { key: FEATURE_KEYS.TOTAL, state: members.total },
    { key: FEATURE_KEYS.FREE, state: members.free },
    { key: FEATURE_KEYS.PAID, state: members.paid },
    { key: FEATURE_KEYS.NEW_24H, state: members.new24h },
    { key: FEATURE_KEYS.NEW_7D, state: members.new7d },
  ]);
  const latest = posts.recent[0];
  add(deviceIds(gladys, DEVICE_TYPES.POSTS, blog.key), [
    { key: FEATURE_KEYS.PUBLISHED, state: posts.published },
    { key: FEATURE_KEYS.DRAFTS, state: posts.drafts },
    { key: FEATURE_KEYS.SCHEDULED, state: posts.scheduled },
    { key: FEATURE_KEYS.LATEST_TITLE, text: featureText(latest?.title) },
    {
      key: FEATURE_KEYS.LATEST_DATE,
      text: latest ? formatDate(latest.publishedAt, language) : '-',
    },
  ]);
  for (const newsletter of blog.newsletters) {
    add(deviceIds(gladys, DEVICE_TYPES.NEWSLETTER, newsletter.id), [
      { key: FEATURE_KEYS.SUBSCRIBERS, state: newsletter.subscribers },
    ]);
  }
  return values;
}
