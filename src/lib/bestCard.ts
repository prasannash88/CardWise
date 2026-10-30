// Ranks cards for a purchase: reward value after caps, open offers, spend-gate needs and
// interest-free days. Each pick comes with a one-line reason.

import { cycleInfo } from './dates';
import { gateStatus, type GateStatus } from './gates';
import { computeRewards, inr, pointsForPurchase, rupeeValue } from './rewards';
import { categoryLabel } from './rules';
import type { Card, CardRule, ISODate, Offer, Transaction } from './types';

export interface CardContext {
  card: Card;
  rule: CardRule | undefined;
  txns: Transaction[]; // includes add-on card spends
  gateOverride: boolean;
  targeted: boolean;
}

export interface Pick {
  card: Card;
  points: number;
  value: number;
  currency: string;
  interestFreeDays: number;
  offers: Offer[];
  gate: GateStatus | null;
  score: number;
  why: string;
}

export function rankCards(
  ctxs: CardContext[],
  amount: number,
  category: string,
  merchant: string,
  offers: Offer[],
  today: ISODate,
): Pick[] {
  const m = merchant.trim().toLowerCase();
  const picks = ctxs
    .filter((c) => !c.card.is_addon)
    .map(({ card, rule, txns, gateOverride, targeted }): Pick => {
      const cyc = cycleInfo(today, card.statement_day, card.due_gap_days);
      const cardOffers = offers.filter(
        (o) => o.card_id === card.id && !o.used && (!o.valid_to || o.valid_to >= today) &&
          (!o.valid_from || o.valid_from <= today) &&
          !!m && (o.merchant.toLowerCase().includes(m) || m.includes(o.merchant.toLowerCase())),
      );
      if (!rule) {
        return {
          card, points: 0, value: 0, currency: '', interestFreeDays: cyc.interestFreeDays, offers: cardOffers,
          gate: null, score: cyc.interestFreeDays / 1000, why: 'No reward rules linked to this card',
        };
      }
      const res = computeRewards(txns, rule, card.statement_day);
      const p = pointsForPurchase(rule, amount, category, res, today, card.statement_day);
      const value = rupeeValue(rule, p.points);
      const gate = gateStatus(rule, txns, today, card.statement_day, gateOverride);
      let gateBonus = 0;
      let gateNote = '';
      if (gate && gate.current.remaining > 0 && !p.excluded) {
        // A spend that moves a targeted gate is worth roughly 1% extra; untargeted gates 0.25%.
        gateBonus = Math.min(amount, gate.current.remaining) * (targeted ? 0.01 : 0.0025);
        const after = gate.current.remaining - amount;
        gateNote = after <= 0
          ? 'completes the lounge spend gate'
          : `${inr(after)} more to the lounge gate after this`;
      }
      const offerBonus = cardOffers.length ? Math.max(50, amount * 0.05) : 0;
      const score = value + gateBonus + offerBonus + cyc.interestFreeDays * 0.01;

      let why: string;
      if (p.excluded) why = `${categoryLabel(category)} earns nothing on this card`;
      else {
        why = `${p.points} ${rule.reward.currency} ≈ ${inr(value, 2)}`;
        if (p.capped) why += ' (cap nearly used)';
      }
      if (cardOffers.length) why += `; offer: ${cardOffers[0].title}`;
      if (gateNote) why += `; ${gateNote}`;
      why += `; ${cyc.interestFreeDays} interest-free days`;
      return {
        card, points: p.points, value, currency: rule.reward.currency, interestFreeDays: cyc.interestFreeDays,
        offers: cardOffers, gate, score, why,
      };
    });
  return picks.sort((a, b) => b.score - a.score);
}

export type BillingTag = { label: string; tone: 'good' | 'warn' | 'bad' } | null;

/** Home-screen tag: "Just billed, buy now", "Bill soon", or "Due in X days" in red. */
export function billingTag(
  today: ISODate,
  statementDay: number,
  dueGap: number,
  outstandingDue: ISODate | null,
): BillingTag {
  const c = cycleInfo(today, statementDay, dueGap);
  if (outstandingDue) {
    const d = Math.round((Date.parse(outstandingDue) - Date.parse(today)) / 86_400_000);
    if (d >= 0 && d <= 5) return { label: d === 0 ? 'Due today' : `Due in ${d} day${d === 1 ? '' : 's'}`, tone: 'bad' };
  }
  if (c.daysSinceStatement >= 1 && c.daysSinceStatement <= 5) return { label: 'Just billed, buy now', tone: 'good' };
  if (c.daysToStatement <= 5) return { label: 'Bill soon', tone: 'warn' };
  return null;
}
