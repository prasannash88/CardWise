import bundled from '../data/rules.json';
import type { Card, CardRule, RulesFile } from './types';

let current: RulesFile = bundled as unknown as RulesFile;

/** Rules in use: the bundled rules.json unless the user imported a newer one. */
export function getRules(): RulesFile {
  return current;
}

export function getBundledRules(): RulesFile {
  return bundled as unknown as RulesFile;
}

export function setRules(r: RulesFile) {
  current = r;
}

export function validateRules(r: unknown): r is RulesFile {
  const x = r as RulesFile;
  return !!x && typeof x.version === 'string' && Array.isArray(x.cards) && Array.isArray(x.categories) &&
    x.cards.every((c) => typeof c.id === 'string' && !!c.reward && typeof c.reward.per_amount === 'number');
}

export function ruleById(id: string | null | undefined, rules: RulesFile = current): CardRule | undefined {
  if (!id) return undefined;
  return rules.cards.find((c) => c.id === id);
}

export function ruleForCard(card: Pick<Card, 'rule_id'>, rules: RulesFile = current): CardRule | undefined {
  return ruleById(card.rule_id, rules);
}

/** Guess a category from a merchant name using rules.json's merchant_map. */
export function categorize(merchant: string, rules: RulesFile = current): string {
  const m = ` ${merchant.toLowerCase()} `;
  for (const entry of rules.merchant_map) {
    if (entry.match.some((k) => m.includes(k.toLowerCase()))) return entry.category;
  }
  return 'other';
}

export function categoryLabel(c: string): string {
  return c.replace(/_/g, ' ').replace(/\b\w/g, (s) => s.toUpperCase());
}
