// Builds everything the screens show for each card from the raw tables.

import {
  getSetting, listCards, listLoungeVisits, listOffers, listStatements, listTransactions,
} from '../db/db';
import { billingTag, type BillingTag } from './bestCard';
import { addDays, cycleContaining, cycleInfo, payByDate, statementDateIn, todayISO, type CycleInfo } from './dates';
import { gateSpend, gateStatus, loungeQuotas, type GateStatus, type LoungeQuota } from './gates';
import { capStatus, computeRewards, rupeeValue, type CapStatus } from './rewards';
import { ruleForCard } from './rules';
import type { Card, CardRule, ISODate, LoungeVisit, Offer, Statement, Transaction } from './types';

export interface Bill {
  statementDate: ISODate;
  due: ISODate;
  payBy: ISODate;
  totalDue: number | null;
  minDue: number | null;
  paid: boolean;
  fromStatement: Statement | null;
  daysToDue: number;
}

export interface CardSummary {
  card: Card;
  rule: CardRule | undefined;
  primary: Card | null;
  addons: Card[];
  cycle: CycleInfo;
  bill: Bill;
  tag: BillingTag;
  txns: Transaction[]; // this card + its add-ons
  cycleSpend: number;
  cyclePoints: number;
  cycleValue: number;
  caps: CapStatus[];
  gate: GateStatus | null;
  gateTargeted: boolean;
  quotas: LoungeQuota[];
  feeWaiver: { target: number; spent: number; pct: number; from: ISODate; to: ISODate } | null;
  statements: Statement[];
}

export interface Overview {
  today: ISODate;
  cards: Card[];
  summaries: CardSummary[];
  offers: Offer[];
  visits: LoungeVisit[];
}

export type GateOverrides = Record<string, ISODate>; // cardId -> start of the window the override applies to
export type GateTargets = Record<string, boolean>;

function daysBetween(a: ISODate, b: ISODate) {
  return Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
}

/** The bill already generated: from an uploaded/entered statement if we have it, else computed. */
export function currentBill(card: Card, statements: Statement[], today: ISODate, holidays: ISODate[]): Bill {
  const c = cycleInfo(today, card.statement_day, card.due_gap_days);
  const real = statements
    .filter((s) => s.card_id === card.id && s.period_end < today)
    .sort((a, b) => (a.period_end < b.period_end ? 1 : -1))[0];
  // Use the real statement if it is the latest bill (within a few days of the computed one).
  if (real && daysBetween(c.previousStatement, real.period_end) <= 5) {
    return {
      statementDate: real.period_end, due: real.due_date, payBy: payByDate(real.due_date, holidays),
      totalDue: real.total_due, minDue: real.min_due, paid: !!real.paid_on, fromStatement: real,
      daysToDue: daysBetween(real.due_date, today),
    };
  }
  return {
    statementDate: c.previousStatement, due: c.previousDue, payBy: payByDate(c.previousDue, holidays),
    totalDue: null, minDue: null, paid: false, fromStatement: null, daysToDue: daysBetween(c.previousDue, today),
  };
}

function feeYear(card: Card, today: ISODate): { from: ISODate; to: ISODate } {
  if (!card.fee_due_month) return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
  const y = Number(today.slice(0, 4));
  let start = statementDateIn(y, card.fee_due_month, 1);
  if (start > today) start = statementDateIn(y - 1, card.fee_due_month, 1);
  const nextStart = statementDateIn(Number(start.slice(0, 4)) + 1, card.fee_due_month, 1);
  return { from: start, to: addDays(nextStart, -1) };
}

export async function loadOverview(today: ISODate = todayISO()): Promise<Overview> {
  const [cards, allTxns, statements, visits, offers, overrides, targets, holidays] = await Promise.all([
    listCards(), listTransactions(), listStatements(), listLoungeVisits(), listOffers(),
    getSetting<GateOverrides>('gate_overrides', {}), getSetting<GateTargets>('gate_targets', {}),
    getSetting<ISODate[]>('holidays', []),
  ]);
  const summaries = cards.map((card): CardSummary => {
    const rule = ruleForCard(card);
    const addons = cards.filter((c) => c.primary_card_id === card.id && c.is_addon);
    const primary = card.is_addon && card.primary_card_id ? cards.find((c) => c.id === card.primary_card_id) ?? null : null;
    const ids = new Set([card.id, ...addons.map((a) => a.id)]);
    const txns = allTxns.filter((t) => ids.has(t.card_id));
    const cycle = cycleInfo(today, card.statement_day, card.due_gap_days);
    const cyc = cycleContaining(today, card.statement_day);
    const inCycle = txns.filter((t) => t.date >= cyc.start && t.date <= cyc.end);
    const cycleSpend = inCycle.reduce((s, t) => s + t.amount, 0);
    let cyclePoints = 0;
    let caps: CapStatus[] = [];
    let gate: GateStatus | null = null;
    let quotas: LoungeQuota[] = [];
    let feeWaiver: CardSummary['feeWaiver'] = null;
    if (rule) {
      const res = computeRewards(txns, rule, card.statement_day);
      cyclePoints = inCycle.reduce((s, t) => s + (res.pointsByTxn.get(t.id) ?? 0), 0);
      caps = capStatus(rule, res, today, card.statement_day);
      const g0 = gateStatus(rule, txns, today, card.statement_day);
      const override = !!g0 && overrides[card.id] === g0.current.start;
      gate = override ? gateStatus(rule, txns, today, card.statement_day, true) : g0;
      const cardVisits = visits.filter((v) => ids.has(v.card_id));
      quotas = card.is_addon ? [] : loungeQuotas(rule, cardVisits, today, card.statement_day, gate);
      if (rule.fee_waiver_spend) {
        const fy = feeYear(card, today);
        const spent = gateSpend(txns, rule, { start: fy.from, end: fy.to });
        feeWaiver = { target: rule.fee_waiver_spend, spent, pct: Math.min(1, spent / rule.fee_waiver_spend), ...fy };
      }
    }
    const bill = currentBill(card, statements, today, holidays);
    return {
      card, rule, primary, addons, cycle, bill,
      tag: billingTag(today, card.statement_day, card.due_gap_days, bill.paid ? null : bill.due),
      txns, cycleSpend, cyclePoints, cycleValue: rule ? rupeeValue(rule, cyclePoints) : 0, caps, gate,
      gateTargeted: !!targets[card.id], quotas, feeWaiver,
      statements: statements.filter((s) => s.card_id === card.id),
    };
  });
  return { today, cards, summaries, offers, visits };
}
