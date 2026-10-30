// Weekly benefits/MITC watcher (Phase 4). Run by .github/workflows/monitor.yml.
//
// For each card in src/data/rules.json it fetches the official benefits page, reduces it to
// plain text, and compares a hash with last week's. When the text changed, Claude summarises
// what changed in plain English and lists any offers on the page. Results go to
// monitor/updates.json, which the app reads from the "Updates feed" URL in Settings.

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';

const ROOT = new URL('../', import.meta.url);
const STATE = new URL('state.json', import.meta.url);
const UPDATES = new URL('updates.json', import.meta.url);
const MAX_CHANGES = 100;
const MAX_TEXT = 60_000; // characters of page text kept per card

const rules = JSON.parse(await readFile(new URL('src/data/rules.json', ROOT), 'utf8'));
const state = JSON.parse(await readFile(STATE, 'utf8').catch(() => '{}'));
const updates = JSON.parse(await readFile(UPDATES, 'utf8').catch(() => '{"changes":[],"offers":[]}'));
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
const today = new Date().toISOString().slice(0, 10);

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8377;|&#x20b9;/gi, 'Rs ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
    .slice(0, MAX_TEXT);
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) CardWiseMonitor/1.0', Accept: 'text/html' },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return htmlToText(await res.text());
}

const ChangeSchema = z.object({
  meaningful: z.boolean().describe('false if only layout, dates, navigation or marketing copy changed'),
  summary: z.string().describe('Plain-English summary of what changed in the benefits/fees/rules, 1-4 short sentences'),
  what_it_means: z.string().describe('What this means for the cardholder in practice, one or two sentences'),
  offers: z.array(z.object({
    title: z.string(),
    merchant: z.string(),
    valid_from: z.string().nullable().describe('YYYY-MM-DD or null'),
    valid_to: z.string().nullable().describe('YYYY-MM-DD or null'),
    how_to_use: z.string(),
  })).describe('Current time-limited offers mentioned on the new page, if any'),
});

async function summarise(card, oldText, newText) {
  const res = await client.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: betaZodOutputFormat(ChangeSchema) },
    messages: [{
      role: 'user',
      content: `The official benefits page for my "${card.name}" credit card changed. My app currently assumes these rules:
${JSON.stringify({ reward: card.reward, lounge: card.lounge, spend_gate: card.spend_gate, fee: card.fee_note, fee_waiver_spend: card.fee_waiver_spend })}

Compare the old and new page text and tell me what changed for me (fees, reward rates, caps, exclusions, lounge access, spend requirements, milestones). Ignore cosmetic changes.

<old_page>
${oldText}
</old_page>

<new_page>
${newText}
</new_page>`,
    }],
  });
  if (res.stop_reason === 'refusal' || !res.parsed_output) throw new Error(`no summary (stop_reason ${res.stop_reason})`);
  return res.parsed_output;
}

let changed = 0;
for (const card of rules.cards) {
  const url = card.benefits_url;
  if (!url) continue;
  let text;
  try {
    text = await fetchText(url);
  } catch (e) {
    console.warn(`${card.id}: fetch failed (${e.message})`);
    continue;
  }
  if (text.length < 500) console.warn(`${card.id}: only ${text.length} chars of text; the page may need a headless browser`);
  const hash = createHash('sha256').update(text).digest('hex');
  const prev = state[card.id];
  state[card.id] = { url, hash, fetched_on: today, text };
  if (!prev) {
    console.log(`${card.id}: baseline saved`);
    continue;
  }
  if (prev.hash === hash) {
    console.log(`${card.id}: no change`);
    continue;
  }
  console.log(`${card.id}: page changed`);
  if (!client) {
    updates.changes.unshift({ rule_id: card.id, url, fetched_on: today, text_hash: hash, summary: 'The official page changed. Open it to review (no API key set for an AI summary).' });
    changed++;
    continue;
  }
  try {
    const s = await summarise(card, prev.text, text);
    if (!s.meaningful) {
      console.log(`${card.id}: cosmetic change only`);
      continue;
    }
    updates.changes.unshift({ rule_id: card.id, url, fetched_on: today, text_hash: hash, summary: s.summary, what_it_means: s.what_it_means });
    for (const o of s.offers) updates.offers.unshift({ rule_id: card.id, url, ...o });
    changed++;
  } catch (e) {
    console.warn(`${card.id}: summary failed (${e.message})`);
  }
}

updates.generated_at = new Date().toISOString();
updates.changes = updates.changes.slice(0, MAX_CHANGES);
updates.offers = updates.offers.filter((o) => !o.valid_to || o.valid_to >= today).slice(0, MAX_CHANGES);
await writeFile(STATE, JSON.stringify(state, null, 1) + '\n');
await writeFile(UPDATES, JSON.stringify(updates, null, 2) + '\n');
console.log(`done: ${changed} meaningful change(s)`);
