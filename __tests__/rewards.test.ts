import { rankCards, billingTag } from '../src/lib/bestCard';
import { gateStatus, loungeQuotas } from '../src/lib/gates';
import { basePoints, capStatus, computeRewards, rupeeValue } from '../src/lib/rewards';
import { categorize, getRules, ruleById, validateRules } from '../src/lib/rules';
import type { Card, LoungeVisit, Transaction } from '../src/lib/types';

const rule = (id: string) => ruleById(id)!;
let nextId = 1;
const t = (p: Partial<Transaction>): Transaction => ({
  id: nextId++, card_id: 1, date: '2026-10-10', amount: 100, merchant: 'x', category: 'other',
  source: 'manual', counts_for_gate: 1, ...p,
});

describe('rules.json', () => {
  it('is valid and has the seven cards', () => {
    expect(validateRules(getRules())).toBe(true);
    expect(getRules().cards).toHaveLength(7);
  });
  it('categorizes merchants', () => {
    expect(categorize('BIGBASKET BANGALORE')).toBe('tata_brands');
    expect(categorize('Indian Oil Petrol Pump')).toBe('fuel');
    expect(categorize('AMAZON PAY INDIA')).toBe('shopping_partners');
    expect(categorize('Random Store')).toBe('other');
  });
});

describe('earning unit and rounding', () => {
  it('rounds down per Rs 100', () => expect(basePoints(rule('mmt_icici'), 999, 'other')).toBe(9));
  it('category rate', () => expect(basePoints(rule('tata_neu_plus_hdfc'), 1000, 'tata_brands')).toBe(20));
  it('excluded categories earn nothing', () => expect(basePoints(rule('scapia_federal'), 5000, 'fuel')).toBe(0));
  it('refunds are negative', () => expect(basePoints(rule('mmt_icici'), -500, 'other')).toBe(-5));
  it('rupee value: 5 Scapia coins = Re 1', () => expect(rupeeValue(rule('scapia_federal'), 50)).toBe(10));
});

describe('caps', () => {
  const r = rule('tata_neu_plus_hdfc');
  it('UPI cap of 500 NeuCoins per month', () => {
    const txns = [t({ amount: 40000, category: 'upi' }), t({ amount: 20000, category: 'upi', date: '2026-10-12' })];
    const res = computeRewards(txns, r, 5);
    expect(res.pointsByTxn.get(txns[0].id)).toBe(400);
    expect(res.pointsByTxn.get(txns[1].id)).toBe(100);
    expect(capStatus(r, res, '2026-10-20', 5)[0]).toMatchObject({ used: 500, remaining: 0 });
    expect(capStatus(r, res, '2026-11-02', 5)[0]).toMatchObject({ used: 0, remaining: 500 });
  });
  it('a refund frees cap room', () => {
    const txns = [
      t({ amount: 50000, category: 'upi', date: '2026-10-01' }),
      t({ amount: -10000, category: 'upi', date: '2026-10-05' }),
      t({ amount: 10000, category: 'upi', date: '2026-10-06' }),
    ];
    const res = computeRewards(txns, r, 5);
    expect([...res.pointsByTxn.values()]).toEqual([500, -100, 100]);
  });
});

describe('spend gates', () => {
  const r = rule('mmt_icici');
  it('previous quarter met unlocks lounge, excluded categories ignored', () => {
    const txns = [
      t({ amount: 70000, date: '2026-08-01' }),
      t({ amount: 10000, date: '2026-09-30', category: 'fuel' }),
      t({ amount: 6000, date: '2026-09-15' }),
      t({ amount: 30000, date: '2026-10-15' }),
    ];
    const g = gateStatus(r, txns, '2026-10-30', 5)!;
    expect(g.previous.spent).toBe(76000);
    expect(g.unlockedNow).toBe(true);
    expect(g.current.spent).toBe(30000);
    expect(g.current.remaining).toBe(45000);
    expect(g.current.daysLeft).toBe(63);
  });
  it('locked without spend; override unlocks', () => {
    expect(gateStatus(r, [], '2026-10-30', 5)!.unlockedNow).toBe(false);
    expect(gateStatus(r, [], '2026-10-30', 5, true)!.unlockedNow).toBe(true);
  });
  it('close to target with under 10 days left', () => {
    const g = gateStatus(r, [t({ amount: 65000, date: '2026-12-01' })], '2026-12-25', 5)!;
    expect(g.close).toBe(true);
  });
  it('Scapia uses billing cycles', () => {
    const s = rule('scapia_federal');
    const g = gateStatus(s, [t({ amount: 21000, date: '2026-10-01' })], '2026-10-10', 5)!;
    expect(g.previous).toMatchObject({ start: '2026-09-06', end: '2026-10-05', met: true });
  });
  it('lounge quota counts visits in the quarter', () => {
    const visits: LoungeVisit[] = [
      { id: 1, card_id: 1, date: '2026-10-02', airport: 'BLR', type: 'domestic', guest: 0 },
      { id: 2, card_id: 1, date: '2026-09-02', airport: 'BLR', type: 'domestic', guest: 0 },
    ];
    const g = gateStatus(r, [], '2026-10-30', 5, true);
    const q = loungeQuotas(r, visits, '2026-10-30', 5, g);
    expect(q[0]).toMatchObject({ allowed: 2, used: 1, left: 1, resetsOn: '2027-01-01', locked: false });
    expect(q[1]).toMatchObject({ type: 'international', left: 1, resetsOn: '2027-01-01' });
  });
});

describe('best card', () => {
  const card = (id: number, rule_id: string): Card => ({
    id, rule_id, name: rule_id, bank: '', network: '', last4: '000' + id, statement_day: 5, due_gap_days: 18,
    credit_limit: null, annual_fee: null, fee_due_month: null, is_addon: 0, primary_card_id: null, addon_holder: null,
  });
  it('picks the Tata card for BigBasket', () => {
    const picks = rankCards(
      [
        { card: card(1, 'tata_neu_plus_hdfc'), rule: rule('tata_neu_plus_hdfc'), txns: [], gateOverride: false, targeted: false },
        { card: card(2, 'uni_goldx_bobcard'), rule: rule('uni_goldx_bobcard'), txns: [], gateOverride: false, targeted: false },
      ],
      2000, 'tata_brands', 'BigBasket', [], '2026-10-30',
    );
    expect(picks[0].card.id).toBe(1);
    expect(picks[0].why).toContain('40 NeuCoins');
  });
  it('billing tags', () => {
    expect(billingTag('2026-11-07', 5, 18, null)?.label).toBe('Just billed, buy now');
    expect(billingTag('2026-11-02', 5, 18, null)?.label).toBe('Bill soon');
    expect(billingTag('2026-10-20', 5, 18, '2026-10-23')).toEqual({ label: 'Due in 3 days', tone: 'bad' });
  });
});
