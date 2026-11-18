// Weekly check of each card's official benefits page, done on the phone. When the page text
// changes, the changed lines go to Claude for a plain-English summary; real changes are listed
// on the Updates screen (tnc_snapshots), offers go to Offers, and you get a notification.

import * as Notifications from 'expo-notifications';
import { getSetting, listCards, listOffers, saveOffer, setSetting, upsertSnapshot } from '../db/db';
import { getApiKey, summarizeTermsChange } from './claude';
import { todayISO } from './dates';
import { hashText, htmlToText, lineDiff } from './html';
import { ruleForCard } from './rules';

const EVERY_DAYS = 7;

type PageState = Record<string, { url: string; hash: string; text: string; checked: string }>;

export interface MonitorResult {
  checked: string[];
  changed: string[];
  failed: { name: string; error: string }[];
  baseline: string[];
}

async function fetchPage(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'text/html' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return htmlToText(await res.text());
  } finally {
    clearTimeout(t);
  }
}

export async function checkTerms(notify = true): Promise<MonitorResult> {
  const cards = (await listCards()).filter((c) => !c.is_addon);
  const state = await getSetting<PageState>('tnc_state', {});
  const hasKey = !!(await getApiKey());
  const out: MonitorResult = { checked: [], changed: [], failed: [], baseline: [] };
  const titles: string[] = [];
  const existingOffers = await listOffers();

  for (const card of cards) {
    const rule = ruleForCard(card);
    if (!rule?.benefits_url) continue;
    let text: string;
    try {
      text = await fetchPage(rule.benefits_url);
    } catch (e) {
      out.failed.push({ name: card.name, error: e instanceof Error ? e.message : String(e) });
      continue;
    }
    out.checked.push(card.name);
    const prev = state[rule.id];
    const hash = hashText(text);
    state[rule.id] = { url: rule.benefits_url, hash, text, checked: todayISO() };
    if (!prev || prev.url !== rule.benefits_url) {
      out.baseline.push(card.name);
      continue;
    }
    if (prev.hash === hash) continue;
    const { removed, added } = lineDiff(prev.text, text);
    if (!removed.length && !added.length) continue;

    if (!hasKey) {
      await upsertSnapshot({
        card_id: card.id, rule_id: rule.id, url: rule.benefits_url, fetched_on: todayISO(), text_hash: hash,
        ai_summary_of_change: `The page changed (${added.length} lines added, ${removed.length} removed). Add a Claude API key in Settings for a plain-English summary.`,
      });
      out.changed.push(card.name);
      continue;
    }
    try {
      const s = await summarizeTermsChange(rule, removed, added);
      if (!s.meaningful) continue;
      await upsertSnapshot({
        card_id: card.id, rule_id: rule.id, url: rule.benefits_url, fetched_on: todayISO(), text_hash: hash,
        ai_summary_of_change: s.summary, what_it_means: s.what_it_means,
      });
      for (const o of s.offers) {
        if (existingOffers.some((e) => e.card_id === card.id && e.title === o.title)) continue;
        await saveOffer({
          card_id: card.id, title: o.title, merchant: o.merchant, valid_from: o.valid_from, valid_to: o.valid_to,
          how_to_use: o.how_to_use, used: 0, source: 'monitor',
        });
      }
      out.changed.push(card.name);
      titles.push(`${card.name}: ${s.summary.split('\n')[0].slice(0, 100)}`);
    } catch (e) {
      // Keep the old snapshot so the change is looked at again next time.
      state[rule.id] = prev;
      out.failed.push({ name: card.name, error: e instanceof Error ? e.message : String(e) });
    }
  }

  await setSetting('tnc_state', state);
  await setSetting('tnc_last_check', Date.now());
  if (notify && out.changed.length) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: out.changed.length === 1 ? 'Card terms changed' : `${out.changed.length} cards changed their terms`,
        body: titles.join('\n') || out.changed.join(', '),
      },
      trigger: null,
    });
  }
  return out;
}

/** Runs the check when it is due (weekly), from app start or the background task. */
export async function autoCheckTerms() {
  const last = await getSetting<number | null>('tnc_last_check', null);
  if (last && Date.now() - last < EVERY_DAYS * 86_400_000) return;
  await checkTerms(true);
}
