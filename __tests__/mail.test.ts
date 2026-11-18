jest.mock('expo-notifications', () => ({}));
jest.mock('expo-secure-store', () => ({}));
jest.mock('expo-file-system', () => ({ File: class {} }));
jest.mock('../modules/statement-inbox', () => ({}));
jest.mock('../src/db/db', () => ({}));

import { cardsForSender, sendersFor } from '../src/lib/mailImport';
import type { Card } from '../src/lib/types';

const card = (id: number, rule_id: string, is_addon = 0): Card => ({
  id, rule_id, name: rule_id, bank: '', network: '', last4: '', statement_day: 5, due_gap_days: 18, credit_limit: null,
  annual_fee: null, fee_due_month: null, is_addon, primary_card_id: null, addon_holder: null,
});
const cards = [card(1, 'mmt_icici'), card(2, 'adani_one_icici_platinum'), card(3, 'tata_neu_plus_hdfc'), card(4, 'mmt_icici', 1)];

it('collects unique senders', () => expect(sendersFor(cards).sort()).toEqual(['hdfc', 'icici']));
it('matches both ICICI cards (old and new bank domains)', () => {
  expect(cardsForSender('ICICI Bank <credit_cards@icicibank.com>', cards)).toEqual([1, 2]);
  expect(cardsForSender('cards@icici.bank.in', cards)).toEqual([1, 2]);
});
it('matches HDFC on hdfc.bank.in', () => expect(cardsForSender('Emailstatements.cards@hdfc.bank.in', cards)).toEqual([3]));
it('ignores other senders', () => expect(cardsForSender('offers@amazon.in', cards)).toEqual([]));
