// Statement emails: fetches PDFs from Gmail (IMAP, read-only, app password) for the banks of the
// cards you hold, keeps them in a small inbox list, and notifies you to review them.

import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { File } from 'expo-file-system';
import { fetchMailPdfs, isInboxAvailable } from '../../modules/statement-inbox';
import { getSetting, listCards, setSetting } from '../db/db';
import { ruleForCard } from './rules';
import type { Card } from './types';

const PASSWORD_KEY = 'gmail_app_password';
const FIRST_LOOKBACK_DAYS = 120;
const AUTO_EVERY_DAYS = 3;

export interface InboxItem {
  id: string; // Message-ID (+ attachment index)
  from: string;
  subject: string;
  date: number;
  fileUri: string | null;
  filename: string | null;
  cardIds: number[]; // cards whose bank sent it
  status: 'new' | 'done' | 'dismissed';
}

export async function getMailAccount(): Promise<{ email: string; hasPassword: boolean }> {
  return {
    email: await getSetting<string>('mail_email', ''),
    hasPassword: !!(await SecureStore.getItemAsync(PASSWORD_KEY)),
  };
}

export async function saveMailAccount(email: string, appPassword: string | null) {
  await setSetting('mail_email', email.trim());
  if (appPassword !== null) {
    if (appPassword.trim()) await SecureStore.setItemAsync(PASSWORD_KEY, appPassword.replace(/\s/g, ''));
    else await SecureStore.deleteItemAsync(PASSWORD_KEY);
  }
}

export async function getMailPassword(): Promise<string | null> {
  return SecureStore.getItemAsync(PASSWORD_KEY);
}

export async function listInbox(): Promise<InboxItem[]> {
  return getSetting<InboxItem[]>('mail_inbox', []);
}

export async function setInboxStatus(id: string, status: InboxItem['status']) {
  const items = await listInbox();
  await setSetting('mail_inbox', items.map((i) => (i.id === id ? { ...i, status } : i)));
}

export function sendersFor(cards: Card[]): string[] {
  const s = new Set<string>();
  for (const c of cards) for (const x of ruleForCard(c)?.statement_senders ?? []) s.add(x.toLowerCase());
  return [...s];
}

export function cardsForSender(from: string, cards: Card[]): number[] {
  const f = from.toLowerCase();
  return cards
    .filter((c) => !c.is_addon && (ruleForCard(c)?.statement_senders ?? []).some((x) => f.includes(x.toLowerCase())))
    .map((c) => c.id);
}

/** Checks Gmail for new statement emails. Returns how many new PDFs were added to the inbox. */
export async function checkMail(): Promise<number> {
  if (!isInboxAvailable()) throw new Error('Email import needs the installed CardWise APK.');
  const { email } = await getMailAccount();
  const password = await getMailPassword();
  if (!email || !password) throw new Error('Add your Gmail address and app password in Settings → Email statements.');
  const cards = (await listCards()).filter((c) => !c.is_addon);
  const senders = sendersFor(cards);
  if (!senders.length) throw new Error('Add your cards first; CardWise looks for emails from their banks.');

  const last = await getSetting<number | null>('mail_last_check', null);
  const since = last ? last - 3 * 86_400_000 : Date.now() - FIRST_LOOKBACK_DAYS * 86_400_000;
  const items = await listInbox();
  const seen = await getSetting<string[]>('mail_seen', []);
  const found = await fetchMailPdfs(email, password, since, senders, seen);

  const added: InboxItem[] = [];
  const newSeen = new Set(seen);
  found.forEach((m, i) => {
    newSeen.add(m.id);
    const id = `${m.id}#${i}`;
    if (items.some((x) => x.id === id)) return;
    added.push({
      id, from: m.from, subject: m.subject, date: m.date, fileUri: m.fileUri, filename: m.filename,
      cardIds: cardsForSender(m.from, cards), status: 'new',
    });
  });
  await setSetting('mail_inbox', [...added, ...items].slice(0, 200));
  await setSetting('mail_seen', [...newSeen].slice(-1000));
  await setSetting('mail_last_check', Date.now());
  return added.filter((a) => a.fileUri).length;
}

/** Background/app-open check, at most every few days, with a notification when something new arrives. */
export async function autoCheckMail() {
  const { email, hasPassword } = await getMailAccount();
  if (!email || !hasPassword || !isInboxAvailable()) return;
  const last = await getSetting<number | null>('mail_last_check', null);
  if (last && Date.now() - last < AUTO_EVERY_DAYS * 86_400_000) return;
  const n = await checkMail();
  if (n > 0) {
    await Notifications.scheduleNotificationAsync({
      content: { title: `${n} new card statement${n === 1 ? '' : 's'} in your email`, body: 'Open CardWise → More → Statements from email to review.' },
      trigger: null,
    });
  }
}

export function fileStillThere(uri: string | null): boolean {
  if (!uri) return false;
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}
