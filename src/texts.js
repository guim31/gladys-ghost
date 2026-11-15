// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report, scene outputs.
// Four languages, the four of the Gladys interface; German says "du", Spanish
// "usted". test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './ghost/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

// What is missing in the configuration (src/config.js missingCredentials).
export const CONNECTION_TEXT = {
  noUrl: {
    en: 'Fill in the address of your Ghost blog and its Admin API key.',
    fr: "Indiquez l'adresse de votre blog Ghost et sa clé Admin API.",
    de: 'Gib die Adresse deines Ghost-Blogs und seinen Admin-API-Schlüssel an.',
    es: 'Indique la dirección de su blog Ghost y su clave Admin API.',
  },
  invalidUrl: {
    en: 'Address not understood, e.g. https://blog.example.org',
    fr: 'Adresse incomprise, ex. https://blog.example.org',
    de: 'Adresse nicht verstanden, z. B. https://blog.example.org',
    es: 'Dirección no válida, p. ej. https://blog.example.org',
  },
  noKey: {
    en: 'Paste the Admin API key of a custom integration (Ghost Settings → Integrations).',
    fr: "Collez la clé Admin API d'une intégration personnalisée (réglages de Ghost → Integrations).",
    de: 'Füge den Admin-API-Schlüssel einer eigenen Integration ein (Ghost-Einstellungen → Integrations).',
    es: 'Pegue la clave Admin API de una integración personalizada (ajustes de Ghost → Integrations).',
  },
  invalidKey: {
    en: 'This is not an Admin API key: copy the "Admin API key", not the Content API key.',
    fr: "Ce n'est pas une clé Admin API : copiez la « Admin API key », pas la clé Content API.",
    de: 'Das ist kein Admin-API-Schlüssel: Kopiere den „Admin API key“, nicht den Content-API-Schlüssel.',
    es: 'No es una clave Admin API: copie la «Admin API key», no la clave Content API.',
  },
};

// One short explanation per error kind (src/ghost/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Ghost does not answer',
    fr: 'Ghost ne répond pas',
    de: 'Ghost antwortet nicht',
    es: 'Ghost no responde',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: use an http:// address or a trusted certificate',
    fr: 'certificat refusé : utilisez une adresse http:// ou un certificat reconnu',
    de: 'Zertifikat abgelehnt: Nutze eine http://-Adresse oder ein vertrauenswürdiges Zertifikat',
    es: 'certificado rechazado: use una dirección http:// o un certificado reconocido',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'Admin API key refused (integration deleted or key regenerated?)',
    fr: 'clé Admin API refusée (intégration supprimée ou clé régénérée ?)',
    de: 'Admin-API-Schlüssel abgelehnt (Integration gelöscht oder Schlüssel neu erzeugt?)',
    es: 'clave Admin API rechazada (¿integración eliminada o clave regenerada?)',
  },
  [ERROR_KINDS.RATE_LIMIT]: {
    en: 'too many requests: choose a longer refresh interval',
    fr: 'trop de requêtes : choisissez un intervalle plus long',
    de: 'zu viele Anfragen: Wähle ein längeres Intervall',
    es: 'demasiadas peticiones: elija un intervalo más largo',
  },
  [ERROR_KINDS.NOT_GHOST]: {
    en: 'no Ghost blog at this address',
    fr: 'aucun blog Ghost à cette adresse',
    de: 'kein Ghost-Blog unter dieser Adresse',
    es: 'no hay ningún blog Ghost en esta dirección',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects elsewhere: enter the address of the Ghost admin',
    fr: "l'adresse redirige ailleurs : saisissez l'adresse de l'admin Ghost",
    de: 'die Adresse leitet woanders hin: Gib die Adresse des Ghost-Admins ein',
    es: 'la dirección redirige a otro sitio: introduzca la dirección del admin de Ghost',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: (version) => `Connected (Ghost ${version})`,
    members: (n) => `${n} member(s)`,
    posts: (n) => `${n} published post(s)`,
  },
  fr: {
    ok: (version) => `Connecté (Ghost ${version})`,
    members: (n) => `${n} membre(s)`,
    posts: (n) => `${n} article(s) publié(s)`,
  },
  de: {
    ok: (version) => `Verbunden (Ghost ${version})`,
    members: (n) => `${n} Mitglied(er)`,
    posts: (n) => `${n} veröffentlichte Beiträge`,
  },
  es: {
    ok: (version) => `Conectado (Ghost ${version})`,
    members: (n) => `${n} miembro(s)`,
    posts: (n) => `${n} artículo(s) publicado(s)`,
  },
};

// The `sentence` output of "Read the figures of the blog".
export const SENTENCE_TEXT = {
  en: {
    members: (name, total, paid) => `${name}: ${total} member(s), ${paid} paid`,
    fresh: (day, week) => `${day} new in 24 h, ${week} in 7 days`,
    latest: (title, date) => `latest post "${title}" on ${date}`,
  },
  fr: {
    members: (name, total, paid) => `${name} : ${total} membre(s), dont ${paid} payant(s)`,
    fresh: (day, week) => `${day} nouveau(x) en 24 h, ${week} en 7 jours`,
    latest: (title, date) => `dernier article « ${title} » le ${date}`,
  },
  de: {
    members: (name, total, paid) => `${name}: ${total} Mitglied(er), davon ${paid} zahlend`,
    fresh: (day, week) => `${day} neu in 24 h, ${week} in 7 Tagen`,
    latest: (title, date) => `neuester Beitrag „${title}“ am ${date}`,
  },
  es: {
    members: (name, total, paid) => `${name}: ${total} miembro(s), ${paid} de pago`,
    fresh: (day, week) => `${day} nuevo(s) en 24 h, ${week} en 7 días`,
    latest: (title, date) => `último artículo «${title}» el ${date}`,
  },
};

export const LANGUAGE_FALLBACK = 'en';

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;
export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];
