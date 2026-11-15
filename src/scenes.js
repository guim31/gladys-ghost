// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// A threshold on one figure is already a scene condition on a device feature.
// The action is about what a condition cannot do: put the figures of the blog
// in a message ("Blog: 132 members, 12 paid, 3 new in 24 h, 9 in 7 days,
// latest post "Hello" on 15/11/2026 21:22"). It reads Ghost again when the
// last read is older than 15 seconds.
// -----------------------------------------------------------------------------

import { missingCredentials } from './config.js';
import { formatDate } from './devices.js';
import { CONNECTION_TEXT, SENTENCE_TEXT, pick } from './texts.js';

export const SCENE_ACTIONS = {
  async get_blog_stats(hub) {
    const language = hub.config.language;
    const missing = missingCredentials(hub.config);
    if (missing) {
      throw new Error(pick(CONNECTION_TEXT[missing], language));
    }
    // After a failed read too: a short outage must not fail the scene.
    await hub.refreshIfStale();
    hub.assertReadable();
    const { members, posts } = hub.blog;
    const name = hub.blogName();
    const latest = posts.recent[0];
    const words = SENTENCE_TEXT[language] ?? SENTENCE_TEXT.en;
    const parts = [
      words.members(name, members.total, members.paid),
      words.fresh(members.new24h, members.new7d),
    ];
    if (latest) {
      parts.push(words.latest(latest.title, formatDate(latest.publishedAt, language)));
    }
    return {
      name,
      members: members.total,
      free: members.free,
      paid: members.paid,
      new_24h: members.new24h,
      new_7d: members.new7d,
      published: posts.published,
      drafts: posts.drafts,
      scheduled: posts.scheduled,
      latest_title: latest?.title ?? '',
      latest_url: latest?.url ?? '',
      sentence: `${parts.join(', ')}.`,
    };
  },
};
