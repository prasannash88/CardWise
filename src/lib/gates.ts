// Spend gates and lounge quotas.

import {
  addDays, cycleContaining, diffDays, monthRange, quarterRange, yearRange,
} from './dates';
import { isExcluded } from './rewards';
import type { CardRule, GateWindow, ISODate, LoungeVisit, Period, Transaction } from './types';

export interface Range { start: ISODate; end: ISODate }

export function windowRange(window: GateWindow, date: ISODate, statementDay: number): Range {
  if (window === 'billing_cycle') return cycleContaining(date, statementDay);
  if (window === 'calendar_month') return monthRange(date);
  return quarterRange(date);
}

export function previousWindowRange(window: GateWindow, date: ISODate, statementDay: number): Range {
  const cur = windowRange(window, date, statementDay);
  return windowRange(window, addDays(cur.start, -1), statementDay);
}

export function periodRange(period: Period, date: ISODate, statementDay: number): Range {
  if (period === 'cycle') return cycleContaining(date, statementDay);
  if (period === 'month') return monthRange(date);
  if (period === 'quarter') return quarterRange(date);
  return yearRange(date);
}

/** Spend that counts toward gates: excludes rule categories and txns flagged off. Refunds subtract. */
export function gateSpend(txns: Transaction[], rule: CardRule | undefined, r: Range): number {
  let sum = 0;
  for (const t of txns) {
    if (t.date < r.start || t.date > r.end) continue;
    if (!t.counts_for_gate) continue;
    if (rule && isExcluded(rule, t.category)) continue;
    sum += t.amount;
  }
  return Math.max(0, Math.round(sum * 100) / 100);
}

export interface GateStatus {
  amount: number;
  window: GateWindow;
  current: Range & { spent: number; remaining: number; pct: number; daysLeft: number; perDayNeeded: number };
  previous: Range & { spent: number; met: boolean };
  /** Lounge unlocked for the current period: previous window met, or user override. */
  unlockedNow: boolean;
  overridden: boolean;
  /** Within 20% of target, not met, fewer than 10 days left. */
  close: boolean;
  /** Not met and the required daily run-rate is more than double the average so far. */
  atRisk: boolean;
}

export function gateStatus(
  rule: CardRule,
  txns: Transaction[],
  today: ISODate,
  statementDay: number,
  override = false,
): GateStatus | null {
  const g = rule.spend_gate;
  if (!g) return null;
  const cur = windowRange(g.window, today, statementDay);
  const prev = previousWindowRange(g.window, today, statementDay);
  const spent = gateSpend(txns, rule, cur);
  const prevSpent = gateSpend(txns, rule, prev);
  const remaining = Math.max(0, g.amount - spent);
  const daysLeft = diffDays(cur.end, today) + 1;
  const elapsed = Math.max(1, diffDays(today, cur.start) + 1);
  const perDayNeeded = remaining > 0 ? Math.ceil(remaining / daysLeft) : 0;
  const avgSoFar = spent / elapsed;
  const met = prevSpent >= g.amount;
  return {
    amount: g.amount,
    window: g.window,
    current: { ...cur, spent, remaining, pct: Math.min(1, spent / g.amount), daysLeft, perDayNeeded },
    previous: { ...prev, spent: prevSpent, met },
    unlockedNow: met || override,
    overridden: override && !met,
    close: remaining > 0 && remaining <= g.amount * 0.2 && daysLeft < 10,
    atRisk: remaining > 0 && perDayNeeded > Math.max(1, avgSoFar) * 2,
  };
}

export interface LoungeQuota {
  type: 'domestic' | 'international';
  period: Period;
  allowed: number | null; // null = unlimited
  used: number;
  left: number | null;
  resetsOn: ISODate;
  locked: boolean;
  note?: string;
}

export function loungeQuotas(
  rule: CardRule,
  visits: LoungeVisit[],
  today: ISODate,
  statementDay: number,
  gate: GateStatus | null,
): LoungeQuota[] {
  return rule.lounge.map((l) => {
    const r = periodRange(l.period, today, statementDay);
    const used = visits.filter((v) => v.type === l.type && !v.guest && v.date >= r.start && v.date <= r.end).length;
    const locked = gate ? !gate.unlockedNow : false;
    const allowed = l.count;
    return {
      type: l.type,
      period: l.period,
      allowed,
      used,
      left: locked ? 0 : allowed === null ? null : Math.max(0, allowed - used),
      resetsOn: addDays(r.end, 1),
      locked,
      note: l.note,
    };
  });
}
