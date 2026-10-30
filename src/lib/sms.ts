// Bank SMS parsing. Pure functions so they can be unit tested with real message samples.
// OTP messages are dropped before anything else is looked at.

import { fmt, isValidISO } from './dates';
import type { ISODate } from './types';

export interface ParsedSms {
  amount: number; // negative for refunds / reversals
  last4: string | null;
  merchant: string;
  date: ISODate;
  isRefund: boolean;
  sender?: string;
  raw: string;
}

const OTP_RE = /\b(otp|one[\s-]?time[\s-]?pass(word|code)?|verification code|security code|do not share|never share|cvv)\b/i;
const SPEND_RE = /\b(spent|debited|used|purchase|txn|transaction|charged|paid|payment of .* at)\b/i;
const REFUND_RE = /\b(refund(ed)?|reversal|reversed|credited back|cashback credited)\b/i;
const NOT_SPEND_RE =
  /\b(payment (of .* )?(has been )?received|received (a )?payment|thank you for (your )?payment|bill (is )?(generated|due)|statement (is )?(generated|ready)|min(imum)? (amount )?due|total (amount )?due|declined|failed|limit (has been )?(increased|enhanced)|e-?mandate|autopay (is )?(set|registered))\b/i;

const AMOUNT_RE = /(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i;
const LAST4_RE = /(?:card|crd|a\/c|acct)[^\d\n]{0,30}?(?:[x*•X]+\s*)?(\d{4})\b/i;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function year4(y: string): number {
  const n = Number(y);
  return y.length === 2 ? 2000 + n : n;
}

function iso(y: number, m: number, d: number): ISODate | null {
  const s = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isValidISO(s) ? s : null;
}

export function parseSmsDate(text: string, fallback: ISODate): ISODate {
  let m = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return iso(+m[1], +m[2], +m[3]) ?? fallback;
  m = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (m) return iso(year4(m[3]), +m[2], +m[1]) ?? fallback;
  m = text.match(/\b(\d{1,2})[-\s]?([A-Za-z]{3,4})[-\s,]*(\d{2,4})?\b/);
  if (m && MONTHS[m[2].toLowerCase()]) {
    const y = m[3] ? year4(m[3]) : Number(fallback.slice(0, 4));
    return iso(y, MONTHS[m[2].toLowerCase()], +m[1]) ?? fallback;
  }
  return fallback;
}

function cleanMerchant(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/[.,;:\-\s]+$/, '')
    .replace(/^(?:VPA\s+|the\s+)/i, '')
    .trim()
    .slice(0, 60);
}

export function parseMerchant(text: string): string {
  const patterns = [
    /\bat\s+(.+?)(?=\s+on\s|\s+dated\s|\s+via\s|\s+ref\b|\.\s|\.?\s*Avl|\s*Avbl|\s*Available|,|\s+for\s+INR|\n|$)/i,
    /\bInfo:?\s*(.+?)(?=\.\s|\s+Avl|\s*Avbl|,|\n|$)/i,
    /\btowards\s+(.+?)(?=\s+on\s|\.\s|,|\n|$)/i,
    /\bto\s+(?:VPA\s+)?([A-Za-z0-9@._&' -]+?)(?=\s+on\s|\s+ref\b|\.\s|,|\n|$)/i,
    /\bfrom\s+(.+?)(?=\s+on\s|\.\s|,|\n|$)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const v = cleanMerchant(m[1]);
      if (v && !/^\d+$/.test(v) && !/^(your|card|a\/c)\b/i.test(v)) return v;
    }
  }
  return 'Unknown';
}

export function isOtp(text: string): boolean {
  return OTP_RE.test(text);
}

/** Returns null for anything that is not a card spend or refund (OTPs always null). */
export function parseBankSms(text: string, receivedOn: ISODate, sender?: string): ParsedSms | null {
  if (!text || isOtp(text)) return null;
  const isRefund = REFUND_RE.test(text);
  if (!isRefund && (NOT_SPEND_RE.test(text) || !SPEND_RE.test(text))) return null;
  if (!/card|crd/i.test(text)) return null; // credit-card alerts only
  const a = text.match(AMOUNT_RE);
  if (!a) return null;
  const amount = Number(a[1].replace(/,/g, ''));
  if (!isFinite(amount) || amount <= 0) return null;
  const l4 = text.match(LAST4_RE);
  return {
    amount: isRefund ? -amount : amount,
    last4: l4 ? l4[1] : null,
    merchant: parseMerchant(text),
    date: parseSmsDate(text, receivedOn),
    isRefund,
    sender,
    raw: text,
  };
}

export function smsTimestampToISO(ms: number): ISODate {
  const d = new Date(ms);
  return fmt(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
}

/** Pick the card for a parsed SMS: last 4 digits first, then issuer name in sender/body. */
export function matchCard<T extends { id: number; last4: string; bank: string }>(
  parsed: ParsedSms,
  cards: T[],
  issuerNames: (c: T) => string[],
): T | undefined {
  if (parsed.last4) {
    const byLast4 = cards.filter((c) => c.last4 === parsed.last4);
    if (byLast4.length === 1) return byLast4[0];
  }
  const hay = `${parsed.sender ?? ''} ${parsed.raw}`.toLowerCase();
  const byIssuer = cards.filter((c) => issuerNames(c).some((n) => hay.includes(n.toLowerCase())));
  return byIssuer.length === 1 ? byIssuer[0] : undefined;
}
