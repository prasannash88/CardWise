// On-device SQLite storage: the seven tables from SPEC.md plus a small key-value
// settings table. All access goes through these helpers.

import * as SQLite from 'expo-sqlite';
import { ruleById } from '../lib/rules';
import type { Card, LoungeVisit, Offer, Statement, TncSnapshot, Transaction } from '../lib/types';

export const DB_NAME = 'cardwise.db';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id TEXT,
  name TEXT NOT NULL,
  bank TEXT NOT NULL DEFAULT '',
  network TEXT NOT NULL DEFAULT '',
  last4 TEXT NOT NULL DEFAULT '',
  statement_day INTEGER NOT NULL,
  due_gap_days INTEGER NOT NULL,
  credit_limit REAL,
  annual_fee REAL,
  fee_due_month INTEGER,
  is_addon INTEGER NOT NULL DEFAULT 0,
  primary_card_id INTEGER REFERENCES cards(id) ON DELETE SET NULL,
  addon_holder TEXT
);
CREATE TABLE IF NOT EXISTS card_rules (
  card_id INTEGER PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
  rule_id TEXT NOT NULL,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  merchant TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'other',
  source TEXT NOT NULL DEFAULT 'manual',
  counts_for_gate INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  sms_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_txn_card_date ON transactions(card_id, date);
CREATE TABLE IF NOT EXISTS statements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  total_due REAL NOT NULL DEFAULT 0,
  min_due REAL NOT NULL DEFAULT 0,
  due_date TEXT NOT NULL,
  paid_on TEXT
);
CREATE TABLE IF NOT EXISTS lounge_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  airport TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'domestic',
  guest INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER REFERENCES cards(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  merchant TEXT NOT NULL DEFAULT '',
  valid_from TEXT,
  valid_to TEXT,
  how_to_use TEXT NOT NULL DEFAULT '',
  used INTEGER NOT NULL DEFAULT 0,
  source TEXT
);
CREATE TABLE IF NOT EXISTS tnc_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER REFERENCES cards(id) ON DELETE SET NULL,
  rule_id TEXT,
  url TEXT NOT NULL,
  fetched_on TEXT NOT NULL,
  text_hash TEXT NOT NULL,
  ai_summary_of_change TEXT NOT NULL DEFAULT '',
  what_it_means TEXT,
  seen INTEGER NOT NULL DEFAULT 0,
  UNIQUE(url, text_hash)
);
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(SCHEMA);
      return db;
    })();
  }
  return dbPromise;
}

// ---- change notifications so screens refresh after writes ----
type Listener = () => void;
const listeners = new Set<Listener>();
export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function notifyChange() {
  listeners.forEach((l) => l());
}

// ---- settings ----
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export async function setSetting(key: string, value: unknown) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO app_settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key, JSON.stringify(value),
  );
  notifyChange();
}

// ---- cards ----
export async function listCards(): Promise<Card[]> {
  const db = await getDb();
  return db.getAllAsync<Card>('SELECT * FROM cards ORDER BY is_addon, name');
}

export async function getCard(id: number): Promise<Card | null> {
  const db = await getDb();
  return db.getFirstAsync<Card>('SELECT * FROM cards WHERE id = ?', id);
}

export type CardInput = Omit<Card, 'id'>;

export async function saveCard(c: CardInput, id?: number): Promise<number> {
  const db = await getDb();
  const vals = [
    c.rule_id, c.name, c.bank, c.network, c.last4.slice(-4), c.statement_day, c.due_gap_days, c.credit_limit,
    c.annual_fee, c.fee_due_month, c.is_addon, c.primary_card_id, c.addon_holder,
  ];
  let cardId = id;
  if (id) {
    await db.runAsync(
      `UPDATE cards SET rule_id=?, name=?, bank=?, network=?, last4=?, statement_day=?, due_gap_days=?, credit_limit=?,
       annual_fee=?, fee_due_month=?, is_addon=?, primary_card_id=?, addon_holder=? WHERE id=?`,
      ...vals, id,
    );
  } else {
    const r = await db.runAsync(
      `INSERT INTO cards(rule_id, name, bank, network, last4, statement_day, due_gap_days, credit_limit, annual_fee,
       fee_due_month, is_addon, primary_card_id, addon_holder) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ...vals,
    );
    cardId = r.lastInsertRowId;
  }
  await syncCardRule(cardId!, c.rule_id);
  notifyChange();
  return cardId!;
}

/** Keeps the card_rules table in step with the rules.json entry linked to each card. */
export async function syncCardRule(cardId: number, ruleId: string | null) {
  const db = await getDb();
  const rule = ruleById(ruleId);
  if (!rule) {
    await db.runAsync('DELETE FROM card_rules WHERE card_id = ?', cardId);
    return;
  }
  await db.runAsync(
    'INSERT INTO card_rules(card_id, rule_id, json) VALUES(?,?,?) ON CONFLICT(card_id) DO UPDATE SET rule_id=excluded.rule_id, json=excluded.json',
    cardId, rule.id, JSON.stringify(rule),
  );
}

export async function syncAllCardRules() {
  for (const c of await listCards()) await syncCardRule(c.id, c.rule_id);
}

export async function deleteCard(id: number) {
  const db = await getDb();
  await db.runAsync('DELETE FROM cards WHERE id = ?', id);
  notifyChange();
}

// ---- transactions ----
export async function listTransactions(opts: { cardIds?: number[]; from?: string; to?: string } = {}): Promise<Transaction[]> {
  const db = await getDb();
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (opts.cardIds) {
    if (opts.cardIds.length === 0) return [];
    where.push(`card_id IN (${opts.cardIds.map(() => '?').join(',')})`);
    params.push(...opts.cardIds);
  }
  if (opts.from) { where.push('date >= ?'); params.push(opts.from); }
  if (opts.to) { where.push('date <= ?'); params.push(opts.to); }
  return db.getAllAsync<Transaction>(
    `SELECT * FROM transactions ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY date DESC, id DESC`,
    ...params,
  );
}

export type TxnInput = Omit<Transaction, 'id'> & { sms_id?: string | null };

export async function saveTransaction(t: TxnInput, id?: number): Promise<number> {
  const db = await getDb();
  if (id) {
    await db.runAsync(
      'UPDATE transactions SET card_id=?, date=?, amount=?, merchant=?, category=?, source=?, counts_for_gate=?, note=? WHERE id=?',
      t.card_id, t.date, t.amount, t.merchant, t.category, t.source, t.counts_for_gate, t.note ?? null, id,
    );
    notifyChange();
    return id;
  }
  const r = await db.runAsync(
    'INSERT INTO transactions(card_id, date, amount, merchant, category, source, counts_for_gate, note, sms_id) VALUES(?,?,?,?,?,?,?,?,?)',
    t.card_id, t.date, t.amount, t.merchant, t.category, t.source, t.counts_for_gate, t.note ?? null, t.sms_id ?? null,
  );
  notifyChange();
  return r.lastInsertRowId;
}

export async function deleteTransaction(id: number) {
  const db = await getDb();
  await db.runAsync('DELETE FROM transactions WHERE id = ?', id);
  notifyChange();
}

export async function knownSmsIds(): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ sms_id: string }>('SELECT sms_id FROM transactions WHERE sms_id IS NOT NULL');
  const dismissed = await getSetting<string[]>('dismissed_sms', []);
  return new Set([...rows.map((r) => r.sms_id), ...dismissed]);
}

/** True when a matching spend (same card, amount, date within a day) already exists. */
export async function isDuplicateTxn(cardId: number, date: string, amount: number): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM transactions WHERE card_id = ? AND ABS(amount - ?) < 0.01
     AND ABS(julianday(date) - julianday(?)) <= 1`,
    cardId, amount, date,
  );
  return (row?.n ?? 0) > 0;
}

// ---- statements ----
export async function listStatements(cardId?: number): Promise<Statement[]> {
  const db = await getDb();
  return cardId
    ? db.getAllAsync<Statement>('SELECT * FROM statements WHERE card_id = ? ORDER BY period_end DESC', cardId)
    : db.getAllAsync<Statement>('SELECT * FROM statements ORDER BY period_end DESC');
}

export async function saveStatement(s: Omit<Statement, 'id'>, id?: number): Promise<number> {
  const db = await getDb();
  if (id) {
    await db.runAsync(
      'UPDATE statements SET card_id=?, period_start=?, period_end=?, total_due=?, min_due=?, due_date=?, paid_on=? WHERE id=?',
      s.card_id, s.period_start, s.period_end, s.total_due, s.min_due, s.due_date, s.paid_on, id,
    );
    notifyChange();
    return id;
  }
  const r = await db.runAsync(
    'INSERT INTO statements(card_id, period_start, period_end, total_due, min_due, due_date, paid_on) VALUES(?,?,?,?,?,?,?)',
    s.card_id, s.period_start, s.period_end, s.total_due, s.min_due, s.due_date, s.paid_on,
  );
  notifyChange();
  return r.lastInsertRowId;
}

export async function deleteStatement(id: number) {
  const db = await getDb();
  await db.runAsync('DELETE FROM statements WHERE id = ?', id);
  notifyChange();
}

// ---- lounge visits ----
export async function listLoungeVisits(cardId?: number): Promise<LoungeVisit[]> {
  const db = await getDb();
  return cardId
    ? db.getAllAsync<LoungeVisit>('SELECT * FROM lounge_visits WHERE card_id = ? ORDER BY date DESC', cardId)
    : db.getAllAsync<LoungeVisit>('SELECT * FROM lounge_visits ORDER BY date DESC');
}

export async function addLoungeVisit(v: Omit<LoungeVisit, 'id'>) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO lounge_visits(card_id, date, airport, type, guest) VALUES(?,?,?,?,?)',
    v.card_id, v.date, v.airport, v.type, v.guest,
  );
  notifyChange();
}

export async function deleteLoungeVisit(id: number) {
  const db = await getDb();
  await db.runAsync('DELETE FROM lounge_visits WHERE id = ?', id);
  notifyChange();
}

// ---- offers ----
export async function listOffers(): Promise<Offer[]> {
  const db = await getDb();
  return db.getAllAsync<Offer>(`SELECT * FROM offers ORDER BY used, COALESCE(valid_to, '9999-12-31')`);
}

export async function saveOffer(o: Omit<Offer, 'id'>, id?: number) {
  const db = await getDb();
  if (id) {
    await db.runAsync(
      'UPDATE offers SET card_id=?, title=?, merchant=?, valid_from=?, valid_to=?, how_to_use=?, used=?, source=? WHERE id=?',
      o.card_id, o.title, o.merchant, o.valid_from, o.valid_to, o.how_to_use, o.used, o.source ?? null, id,
    );
  } else {
    await db.runAsync(
      'INSERT INTO offers(card_id, title, merchant, valid_from, valid_to, how_to_use, used, source) VALUES(?,?,?,?,?,?,?,?)',
      o.card_id, o.title, o.merchant, o.valid_from, o.valid_to, o.how_to_use, o.used, o.source ?? null,
    );
  }
  notifyChange();
}

export async function setOfferUsed(id: number, used: boolean) {
  const db = await getDb();
  await db.runAsync('UPDATE offers SET used = ? WHERE id = ?', used ? 1 : 0, id);
  notifyChange();
}

export async function deleteOffer(id: number) {
  const db = await getDb();
  await db.runAsync('DELETE FROM offers WHERE id = ?', id);
  notifyChange();
}

// ---- T&C snapshots / updates ----
export async function listSnapshots(): Promise<TncSnapshot[]> {
  const db = await getDb();
  return db.getAllAsync<TncSnapshot>('SELECT * FROM tnc_snapshots ORDER BY fetched_on DESC, id DESC');
}

/** Inserts if new; returns true when it was not seen before. */
export async function upsertSnapshot(s: Omit<TncSnapshot, 'id' | 'seen'>): Promise<boolean> {
  const db = await getDb();
  const r = await db.runAsync(
    `INSERT OR IGNORE INTO tnc_snapshots(card_id, rule_id, url, fetched_on, text_hash, ai_summary_of_change, what_it_means)
     VALUES(?,?,?,?,?,?,?)`,
    s.card_id, s.rule_id, s.url, s.fetched_on, s.text_hash, s.ai_summary_of_change, s.what_it_means ?? null,
  );
  if (r.changes > 0) notifyChange();
  return r.changes > 0;
}

export async function markSnapshotsSeen() {
  const db = await getDb();
  await db.runAsync('UPDATE tnc_snapshots SET seen = 1 WHERE seen = 0');
  notifyChange();
}

// ---- backup / restore ----
export const TABLES = ['cards', 'card_rules', 'transactions', 'statements', 'lounge_visits', 'offers', 'tnc_snapshots', 'app_settings'] as const;

export async function dumpAll(): Promise<Record<string, unknown[]>> {
  const db = await getDb();
  const out: Record<string, unknown[]> = {};
  for (const t of TABLES) out[t] = await db.getAllAsync(`SELECT * FROM ${t}`);
  return out;
}

export async function restoreAll(data: Record<string, Record<string, unknown>[]>) {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const t of [...TABLES].reverse()) await tx.runAsync(`DELETE FROM ${t}`);
    for (const t of TABLES) {
      for (const row of data[t] ?? []) {
        const cols = Object.keys(row);
        if (!cols.length || cols.some((c) => !/^[a-z_0-9]+$/.test(c))) continue;
        await tx.runAsync(
          `INSERT INTO ${t}(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`,
          ...cols.map((c) => row[c] as string | number | null),
        );
      }
    }
  });
  notifyChange();
}
