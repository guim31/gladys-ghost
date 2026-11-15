// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `ghost_overview`.
//
// The use case: a glance at the wall tablet tells how the blog grows —
// members, paid members, new members this week, published posts — and which
// post came out last. The figures are sent as values, not bound to device
// features: the widget works before the devices are added.
//
// Budget (8 components, 2 texts): four tiles, one text when Ghost does not
// answer, one caption for the latest post, a Refresh button. The caption and
// the button can be hidden in the widget settings.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { formatDate } from './devices.js';
import { WIDGET_KEY } from './hub.js';
import { ERROR_TEXT, labelled, pick } from './texts.js';

// Action key of the button: permanent once published.
export const ACTIONS = Object.freeze({ REFRESH: 'refresh' });

export const TEXT = {
  pick: {
    en: 'Fill in your Ghost blog in the configuration of the integration.',
    fr: "Renseignez votre blog Ghost dans la configuration de l'intégration.",
    de: 'Trage deinen Ghost-Blog in der Konfiguration der Integration ein.',
    es: 'Indique su blog Ghost en la configuración de la integración.',
  },
  waiting: {
    en: 'Ghost has not been read yet.',
    fr: "Ghost n'a pas encore été lu.",
    de: 'Ghost wurde noch nicht gelesen.',
    es: 'Ghost todavía no se ha leído.',
  },
  members: { en: 'Members', fr: 'Membres', de: 'Mitglieder', es: 'Miembros' },
  paid: { en: 'Paid', fr: 'Payants', de: 'Zahlend', es: 'De pago' },
  new7d: { en: 'New (7 days)', fr: 'Nouveaux (7 j)', de: 'Neu (7 Tage)', es: 'Nuevos (7 días)' },
  posts: { en: 'Posts', fr: 'Articles', de: 'Beiträge', es: 'Artículos' },
  latest: {
    en: 'Latest post',
    fr: 'Dernier article',
    de: 'Neuester Beitrag',
    es: 'Último artículo',
  },
  refresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  refreshed: {
    en: 'Ghost read again.',
    fr: 'Ghost relu.',
    de: 'Ghost neu gelesen.',
    es: 'Ghost leído de nuevo.',
  },
};

const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: pick(text, language) }],
  };
}

// A boolean setting shown by default: only an explicit false hides.
const shown = (settings, key) => settings?.[key] !== false;

async function get(hub, { settings = {}, language = 'en' }) {
  if (!hub.client) {
    return message(TEXT.pick, language);
  }
  const blog = hub.blog;
  if (!blog) {
    return hub.error
      ? message(ERROR_TEXT[hub.error.kind], language)
      : message(TEXT.waiting, language);
  }
  const components = [
    {
      type: 'value',
      value: blog.members.total,
      label: pick(TEXT.members, language),
      icon: 'users',
      color: WIDGET_COLORS.INFO,
    },
    {
      type: 'value',
      value: blog.members.paid,
      label: pick(TEXT.paid, language),
      icon: 'credit-card',
      color: blog.members.paid > 0 ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
    },
    {
      type: 'value',
      value: blog.members.new7d,
      label: pick(TEXT.new7d, language),
      icon: 'user-plus',
      color: blog.members.new7d > 0 ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
    },
    {
      type: 'value',
      value: blog.posts.published,
      label: pick(TEXT.posts, language),
      icon: 'file-text',
      color: WIDGET_COLORS.NEUTRAL,
    },
  ];
  if (hub.error) {
    components.push({
      type: 'text',
      variant: 'body',
      text: pick(ERROR_TEXT[hub.error.kind], language),
    });
  }
  const latest = blog.posts.recent[0];
  if (latest && shown(settings, 'show_latest')) {
    components.push({
      type: 'text',
      variant: 'caption',
      text: fit(
        labelled(
          pick(TEXT.latest, language),
          `${latest.title} (${formatDate(latest.publishedAt, language)})`,
          language,
        ),
        120,
      ),
    });
  }
  if (shown(settings, 'show_refresh')) {
    components.push({
      type: 'button',
      label: pick(TEXT.refresh, language),
      icon: 'refresh-cw',
      style: 'secondary',
      action: { key: ACTIONS.REFRESH },
    });
  }
  return { ttl_seconds: 120, components };
}

async function action(hub, { actionKey }) {
  if (actionKey !== ACTIONS.REFRESH) {
    throw new Error(`Unknown action ${actionKey}`);
  }
  await hub.pollNow();
  if (hub.error) {
    return { message: ERROR_TEXT[hub.error.kind] };
  }
  return { message: TEXT.refreshed };
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
