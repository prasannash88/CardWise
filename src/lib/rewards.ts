// Rewards maths: rate lookup -> earning unit (rounded as the bank does) -> exclusions
// -> monthly / cycle caps -> rupee value. Refunds (negative amounts) take points back.

import { cycleContaining } from './dates';
import type { CardRule, ISODate, RewardCap, Transaction } from './types';

export function isExcluded(rule: CardRule, category: string): boolean {
  return rule.reward.excluded_categories.includes(category);
}

export function rateFor(rule: CardRule, category: string): number {
  if (isExcluded(rule, category)) return 0;
  return rule.reward.rates[category] ?? rule.reward.rates.default ?? 0;
}

/** Points before caps. Signed: a refund returns negative points. */
export function basePoints(rule: CardRule, amount: number, category: string): number {
  const rate = rateFor(rule, category);
  if (rate === 0) return 0;
  const units = Math.abs(amount) / rule.reward.per_amount;
  const whole = rule.reward.rounding === 'round' ? Math.round(units) : Math.floor(units);
  const pts = whole * rate;
  return amount < 0 ? -pts : pts;
}

export function capKey(cap: RewardCap, date: ISODate, statementDay: number): string {
  return cap.period === 'month' ? date.slice(0, 7) : cycleContaining(date, statementDay).end;
}

function capApplies(cap: RewardCap, category: string): boolean {
  return cap.categories === null || cap.categories.includes(category);
}

export interface RewardResult {
  pointsByTxn: Map<number, number>;
  capUsed: Map<string, number>; // `${capIndex}|${periodKey}` -> points used
}

/**
 * Walks transactions in date order and applies caps. Points from a refund reduce the
 * cap bucket they came from, so a later purchase can earn again.
 */
export function computeRewards(txns: Transaction[], rule: CardRule, statementDay: number): RewardResult {
  const sorted = [...txns].sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1));
  const pointsByTxn = new Map<number, number>();
  const capUsed = new Map<string, number>();
  for (const t of sorted) {
    let pts = basePoints(rule, t.amount, t.category);
    rule.reward.caps.forEach((cap, i) => {
      if (!capApplies(cap, t.category)) return;
      const key = `${i}|${capKey(cap, t.date, statementDay)}`;
      const used = capUsed.get(key) ?? 0;
      if (pts > 0) {
        pts = Math.min(pts, Math.max(0, cap.max_points - used));
        capUsed.set(key, used + pts);
      } else if (pts < 0) {
        const back = Math.min(-pts, used);
        pts = -back;
        capUsed.set(key, used - back);
      }
    });
    pointsByTxn.set(t.id, pts);
  }
  return { pointsByTxn, capUsed };
}

export interface CapStatus {
  label: string;
  period: 'month' | 'cycle';
  max: number;
  used: number;
  remaining: number;
}

export function capStatus(
  rule: CardRule,
  result: RewardResult,
  today: ISODate,
  statementDay: number,
): CapStatus[] {
  return rule.reward.caps.map((cap, i) => {
    const used = result.capUsed.get(`${i}|${capKey(cap, today, statementDay)}`) ?? 0;
    return {
      label: cap.label ?? (cap.categories ? cap.categories.join(', ') : 'All spends'),
      period: cap.period,
      max: cap.max_points,
      used,
      remaining: Math.max(0, cap.max_points - used),
    };
  });
}

/** Points a new purchase would earn today, given caps already used. */
export function pointsForPurchase(
  rule: CardRule,
  amount: number,
  category: string,
  result: RewardResult,
  today: ISODate,
  statementDay: number,
): { points: number; capped: boolean; excluded: boolean } {
  const base = basePoints(rule, amount, category);
  let pts = base;
  rule.reward.caps.forEach((cap, i) => {
    if (!capApplies(cap, category)) return;
    const used = result.capUsed.get(`${i}|${capKey(cap, today, statementDay)}`) ?? 0;
    pts = Math.min(pts, Math.max(0, cap.max_points - used));
  });
  return { points: pts, capped: pts < base, excluded: isExcluded(rule, category) };
}

export function rupeeValue(rule: CardRule, points: number): number {
  return Math.round(points * rule.reward.rupee_value * 100) / 100;
}

export function inr(n: number, decimals = 0): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const min = decimals && !Number.isInteger(abs) ? decimals : 0;
  return `${sign}Rs ${abs.toLocaleString('en-IN', { maximumFractionDigits: decimals, minimumFractionDigits: min })}`;
}
