// Shared types. Dates are local calendar dates stored as 'YYYY-MM-DD' strings.

export type ISODate = string;

export type Period = 'month' | 'quarter' | 'year' | 'cycle';
export type GateWindow = 'billing_cycle' | 'calendar_month' | 'calendar_quarter';

export interface RewardCap {
  categories: string[] | null; // null = all categories
  max_points: number;
  period: 'month' | 'cycle';
  label?: string;
}

export interface CardRule {
  id: string;
  name: string;
  bank: string;
  issuer_sms_names: string[];
  network: string;
  annual_fee: number;
  fee_note?: string;
  fee_waiver_spend: number | null;
  reward: {
    currency: string;
    per_amount: number;
    rupee_value: number;
    rounding: 'floor' | 'round';
    rates: Record<string, number>; // points per `per_amount`; 'default' applies to anything else
    excluded_categories: string[];
    caps: RewardCap[];
    note?: string;
  };
  lounge: { type: 'domestic' | 'international'; count: number | null; period: Period; note?: string }[];
  spend_gate: { amount: number; window: GateWindow; unlocks: 'next_period' | 'on_completion'; note?: string } | null;
  milestones: { label: string; spend: number | null }[];
  perks: string[];
  watch_outs: string[];
  benefits_url: string;
  source_url: string;
  verified_on: string;
}

export interface RulesFile {
  version: string;
  notes?: string;
  categories: string[];
  merchant_map: { match: string[]; category: string }[];
  cards: CardRule[];
}

export interface Card {
  id: number;
  rule_id: string | null;
  name: string;
  bank: string;
  network: string;
  last4: string;
  statement_day: number;
  due_gap_days: number;
  credit_limit: number | null;
  annual_fee: number | null;
  fee_due_month: number | null; // 1-12
  is_addon: number; // 0/1
  primary_card_id: number | null;
  addon_holder: string | null;
}

export type TxnSource = 'sms' | 'statement' | 'manual';

export interface Transaction {
  id: number;
  card_id: number;
  date: ISODate;
  amount: number; // negative = refund
  merchant: string;
  category: string;
  source: TxnSource;
  counts_for_gate: number; // 0/1
  note?: string | null;
}

export interface Statement {
  id: number;
  card_id: number;
  period_start: ISODate;
  period_end: ISODate;
  total_due: number;
  min_due: number;
  due_date: ISODate;
  paid_on: ISODate | null;
}

export interface LoungeVisit {
  id: number;
  card_id: number;
  date: ISODate;
  airport: string;
  type: 'domestic' | 'international';
  guest: number; // 0/1
}

export interface Offer {
  id: number;
  card_id: number | null;
  title: string;
  merchant: string;
  valid_from: ISODate | null;
  valid_to: ISODate | null;
  how_to_use: string;
  used: number;
  source?: string | null;
}

export interface TncSnapshot {
  id: number;
  card_id: number | null;
  rule_id: string | null;
  url: string;
  fetched_on: ISODate;
  text_hash: string;
  ai_summary_of_change: string;
  what_it_means?: string | null;
  seen: number;
}
