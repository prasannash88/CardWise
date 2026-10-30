// Scans the SMS inbox for card spend alerts and turns them into candidate transactions
// for the user to confirm. Nothing is saved without confirmation.

import { getSetting, isDuplicateTxn, knownSmsIds, listCards, setSetting } from '../db/db';
import { readInbox } from '../../modules/sms-reader';
import { matchCard, parseBankSms, smsTimestampToISO, type ParsedSms } from './sms';
import { categorize, ruleForCard } from './rules';
import type { Card } from './types';

export interface SmsCandidate {
  smsId: string;
  parsed: ParsedSms;
  card: Card | undefined;
  category: string;
  duplicate: boolean;
}

const DEFAULT_LOOKBACK_DAYS = 60;

export async function scanSms(): Promise<SmsCandidate[]> {
  const cards = await listCards();
  const last = await getSetting<number>('last_sms_scan', Date.now() - DEFAULT_LOOKBACK_DAYS * 86_400_000);
  const msgs = await readInbox(last - 86_400_000, 1000);
  const known = await knownSmsIds();
  const out: SmsCandidate[] = [];
  for (const m of msgs) {
    if (known.has(m.id)) continue;
    const parsed = parseBankSms(m.body, smsTimestampToISO(m.date), m.address ?? undefined);
    if (!parsed) continue;
    const card = matchCard(parsed, cards, (c) => ruleForCard(c)?.issuer_sms_names ?? [c.bank.split(' ')[0]]);
    const duplicate = card ? await isDuplicateTxn(card.id, parsed.date, parsed.amount) : false;
    out.push({ smsId: m.id, parsed, card, category: categorize(parsed.merchant), duplicate });
  }
  return out;
}

export async function markScanned() {
  await setSetting('last_sms_scan', Date.now());
}

export async function dismissSms(ids: string[]) {
  const cur = await getSetting<string[]>('dismissed_sms', []);
  await setSetting('dismissed_sms', [...cur, ...ids].slice(-2000));
}
