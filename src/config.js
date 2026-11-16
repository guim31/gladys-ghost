// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// The address of the blog and the Admin API key of a custom integration
// created in Ghost (Settings → Integrations).
// -----------------------------------------------------------------------------

import { ADMIN_KEY } from './ghost/client.js';

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Refresh intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['60', '300', '900', '1800'];

export const DEFAULT_CONFIG = {
  url: '',
  admin_api_key: '',
  poll_interval: '300',
  language: 'fr',
};

/**
 * Parse the address typed by the user into a base URL: a bare host
 * (`blog.example.org`, HTTPS then), an address with its scheme, or one copied
 * from the browser (`https://blog.example.org/ghost/#/dashboard`). A path is
 * kept (Ghost in a sub-directory), the admin pages dropped.
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port][/path]`, '' when empty, null
 *   when unusable
 */
export function parseServerUrl(raw) {
  if (typeof raw !== 'string') {
    return '';
  }
  const text = raw.trim();
  if (!text) {
    return '';
  }
  // A public blog is on HTTPS; a local one is typed with its http://.
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs.
  if (url.username || url.password) {
    return null;
  }
  const path = url.pathname.replace(/\/ghost(\/.*)?$/i, '').replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/** Host part shown to the user and in the logs (no scheme). */
export const hostOf = (url) => (url ? url.replace(/^https?:\/\//, '') : '');

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const pollInterval = POLL_INTERVALS.includes(String(source.poll_interval))
    ? String(source.poll_interval)
    : DEFAULT_CONFIG.poll_interval;
  return {
    url: parseServerUrl(source.url),
    // A pasted key often carries a trailing space or new line.
    key: typeof source.admin_api_key === 'string' ? source.admin_api_key.trim() : '',
    pollIntervalMs: Number(pollInterval) * 1000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}

/**
 * What is missing to read the blog, null when the configuration is complete:
 * 'noUrl', 'invalidUrl', 'noKey' or 'invalidKey'.
 */
export function missingCredentials(config) {
  if (config.url === '') {
    return 'noUrl';
  }
  if (config.url === null) {
    return 'invalidUrl';
  }
  if (!config.key) {
    return 'noKey';
  }
  return ADMIN_KEY.test(config.key) ? null : 'invalidKey';
}
