// Phase 4: pulls the T&C / benefit changes and offers that the scheduled monitor job
// (monitor/ + GitHub Actions) publishes as updates.json, and stores them locally.

import * as Notifications from 'expo-notifications';
import { getSetting, listCards, listOffers, saveOffer, setSetting, upsertSnapshot } from '../db/db';

export interface UpdatesFeed {
  generated_at: string;
  changes: { rule_id: string; url: string; fetched_on: string; text_hash: string; summary: string; what_it_means?: string }[];
  offers: { rule_id: string; title: string; merchant?: string; valid_from?: string | null; valid_to?: string | null; how_to_use?: string; url?: string }[];
}

export async function getUpdatesUrl(): Promise<string> {
  return getSetting<string>('updates_url', '');
}

export async function fetchUpdates(notify = true): Promise<{ newChanges: number; newOffers: number }> {
  const url = await getUpdatesUrl();
  if (!url) return { newChanges: 0, newOffers: 0 };
  const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) throw new Error(`Updates feed returned ${res.status}`);
  const feed = (await res.json()) as UpdatesFeed;
  const cards = await listCards();
  const cardFor = (ruleId: string) => cards.find((c) => c.rule_id === ruleId && !c.is_addon)?.id ?? null;

  let newChanges = 0;
  const titles: string[] = [];
  for (const ch of feed.changes ?? []) {
    const isNew = await upsertSnapshot({
      card_id: cardFor(ch.rule_id), rule_id: ch.rule_id, url: ch.url, fetched_on: ch.fetched_on,
      text_hash: ch.text_hash, ai_summary_of_change: ch.summary, what_it_means: ch.what_it_means ?? null,
    });
    if (isNew) {
      newChanges++;
      titles.push(ch.summary.split('\n')[0].slice(0, 120));
    }
  }

  const existing = await listOffers();
  let newOffers = 0;
  for (const o of feed.offers ?? []) {
    const cardId = cardFor(o.rule_id);
    if (!cardId) continue;
    if (existing.some((e) => e.card_id === cardId && e.title === o.title)) continue;
    await saveOffer({
      card_id: cardId, title: o.title, merchant: o.merchant ?? '', valid_from: o.valid_from ?? null,
      valid_to: o.valid_to ?? null, how_to_use: o.how_to_use ?? (o.url ? `See ${o.url}` : ''), used: 0, source: 'monitor',
    });
    newOffers++;
  }

  await setSetting('updates_last_fetch', new Date().toISOString());
  if (notify && newChanges > 0) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: newChanges === 1 ? 'Card benefit change detected' : `${newChanges} card benefit changes detected`,
        body: titles.join('\n'),
      },
      trigger: null,
    });
  }
  return { newChanges, newOffers };
}
