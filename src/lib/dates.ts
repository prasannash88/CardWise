// Calendar-date maths for billing cycles. Everything works on 'YYYY-MM-DD' strings and
// UTC midnights so daylight-saving and time zones never shift a day.

import type { ISODate } from './types';

const DAY_MS = 86_400_000;

export function toDate(d: ISODate): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function fmt(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function todayISO(now: Date = new Date()): ISODate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(d: ISODate, n: number): ISODate {
  return fmt(new Date(toDate(d).getTime() + n * DAY_MS));
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toDate(a).getTime() - toDate(b).getTime()) / DAY_MS);
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** Statement date in a given month; short months use their last day. */
export function statementDateIn(year: number, month1: number, statementDay: number): ISODate {
  const day = Math.min(statementDay, daysInMonth(year, month1));
  return fmt(new Date(Date.UTC(year, month1 - 1, day)));
}

function ym(d: ISODate): [number, number] {
  const [y, m] = d.split('-').map(Number);
  return [y, m];
}

function shiftMonth(year: number, month1: number, by: number): [number, number] {
  const idx = year * 12 + (month1 - 1) + by;
  return [Math.floor(idx / 12), (idx % 12) + 1];
}

/** Next statement date on or after `today`. A purchase made today lands on this bill. */
export function nextStatementDate(today: ISODate, statementDay: number): ISODate {
  const [y, m] = ym(today);
  const thisMonth = statementDateIn(y, m, statementDay);
  if (thisMonth >= today) return thisMonth;
  const [ny, nm] = shiftMonth(y, m, 1);
  return statementDateIn(ny, nm, statementDay);
}

/** Most recent statement date strictly before `today` (the bill already generated). */
export function previousStatementDate(today: ISODate, statementDay: number): ISODate {
  const [y, m] = ym(today);
  const thisMonth = statementDateIn(y, m, statementDay);
  if (thisMonth < today) return thisMonth;
  const [py, pm] = shiftMonth(y, m, -1);
  return statementDateIn(py, pm, statementDay);
}

/** The statement date that follows a given statement date. */
export function statementAfter(statementDate: ISODate, statementDay: number): ISODate {
  const [y, m] = ym(statementDate);
  const [ny, nm] = shiftMonth(y, m, 1);
  return statementDateIn(ny, nm, statementDay);
}

export function isWeekend(d: ISODate): boolean {
  const wd = toDate(d).getUTCDay();
  return wd === 0 || wd === 6;
}

/**
 * Due dates are shown as printed; if one falls on a weekend or holiday the app
 * warns a day earlier (and keeps stepping back past consecutive non-working days).
 */
export function payByDate(due: ISODate, holidays: ISODate[] = []): ISODate {
  if (!isWeekend(due) && !holidays.includes(due)) return due;
  let d = addDays(due, -1);
  while (isWeekend(d) || holidays.includes(d)) d = addDays(d, -1);
  return d;
}

export interface CycleInfo {
  cycleStart: ISODate; // day after previous statement
  nextStatement: ISODate; // closes the current cycle
  daysToStatement: number;
  nextDue: ISODate; // due date of the bill that will include today's purchase
  interestFreeDays: number; // if you buy today
  previousStatement: ISODate;
  previousDue: ISODate; // due date of the bill already generated
  bestDayToBuy: ISODate;
  bestDayInterestFree: number;
  worstDayToBuy: ISODate;
  worstDayInterestFree: number;
  daysSinceStatement: number;
}

export function cycleInfo(today: ISODate, statementDay: number, dueGap: number): CycleInfo {
  const next = nextStatementDate(today, statementDay);
  const prev = previousStatementDate(today, statementDay);
  const nextDue = addDays(next, dueGap);
  const best = addDays(next, 1);
  const bestBill = statementAfter(next, statementDay);
  return {
    cycleStart: addDays(prev, 1),
    nextStatement: next,
    daysToStatement: diffDays(next, today),
    nextDue,
    interestFreeDays: diffDays(nextDue, today),
    previousStatement: prev,
    previousDue: addDays(prev, dueGap),
    bestDayToBuy: best,
    bestDayInterestFree: diffDays(addDays(bestBill, dueGap), best),
    worstDayToBuy: next,
    worstDayInterestFree: dueGap,
    daysSinceStatement: diffDays(today, prev),
  };
}

/** Billing cycle (start..end inclusive) that contains `date`. */
export function cycleContaining(date: ISODate, statementDay: number): { start: ISODate; end: ISODate } {
  const end = nextStatementDate(date, statementDay);
  const prev = previousStatementDate(date, statementDay);
  return { start: addDays(prev, 1), end };
}

export function monthRange(date: ISODate): { start: ISODate; end: ISODate } {
  const [y, m] = ym(date);
  return { start: statementDateIn(y, m, 1), end: statementDateIn(y, m, 31) };
}

export function quarterRange(date: ISODate): { start: ISODate; end: ISODate } {
  const [y, m] = ym(date);
  const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
  return { start: statementDateIn(y, qStartMonth, 1), end: statementDateIn(y, qStartMonth + 2, 31) };
}

export function yearRange(date: ISODate): { start: ISODate; end: ISODate } {
  const [y] = ym(date);
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

export function quarterLabel(date: ISODate): string {
  const [y, m] = ym(date);
  return `Q${Math.floor((m - 1) / 3) + 1} ${y}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function pretty(d: ISODate | null | undefined): string {
  if (!d) return '—';
  const [y, m, day] = d.split('-').map(Number);
  return `${day} ${MONTHS[m - 1]} ${y}`;
}

export function prettyShort(d: ISODate | null | undefined): string {
  if (!d) return '—';
  const [, m, day] = d.split('-').map(Number);
  return `${day} ${MONTHS[m - 1]}`;
}

export function isValidISO(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return fmt(toDate(d)) === d;
}
