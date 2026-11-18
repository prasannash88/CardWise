// Statement reading with the Claude API. The API key lives in the phone's secure storage.
// Only the statement (PDF or pasted text) is sent; never card images.

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';
import { getRules } from './rules';
import type { CardRule } from './types';

const KEY = 'anthropic_api_key';
const MODEL = 'claude-opus-5-5';

export async function getApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY);
}
export async function setApiKey(v: string) {
  if (v.trim()) await SecureStore.setItemAsync(KEY, v.trim());
  else await SecureStore.deleteItemAsync(KEY);
}

async function client(keyOverride?: string): Promise<Anthropic> {
  const apiKey = keyOverride ?? (await getApiKey());
  if (!apiKey) throw new Error('Add your Claude API key in Settings first.');
  // The key is the user's own and stays on their phone; the SDK's browser guard doesn't apply.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

const StatementSchema = z.object({
  card_last4: z.string().describe('Last 4 digits of the card number, or empty string if not shown'),
  period_start: z.string().describe('Statement period start, YYYY-MM-DD'),
  period_end: z.string().describe('Statement date / period end, YYYY-MM-DD'),
  total_due: z.number(),
  min_due: z.number(),
  due_date: z.string().describe('Payment due date, YYYY-MM-DD'),
  transactions: z.array(z.object({
    date: z.string().describe('YYYY-MM-DD'),
    merchant: z.string(),
    amount: z.number().describe('Positive for purchases, negative for refunds/reversals/credits. Exclude bill payments.'),
    category: z.string().describe('One of the allowed categories'),
  })),
});
export type ExtractedStatement = z.infer<typeof StatementSchema>;

function instructions(cardName: string) {
  return `This is a credit card statement for my "${cardName}" card. Extract the statement period, total amount due, minimum amount due, payment due date and every transaction.
Rules:
- Dates as YYYY-MM-DD.
- Purchases are positive amounts. Refunds, reversals and cashback credits are negative. Do NOT include payments I made towards the bill, opening balance, or interest/fee summary lines.
- For category choose the best fit from: ${getRules().categories.join(', ')}. Use "other" if unsure.
- Never include full card numbers; only the last 4 digits.`;
}

async function extract(content: Anthropic.Beta.BetaContentBlockParam[], keyOverride?: string): Promise<ExtractedStatement> {
  const c = await client(keyOverride);
  const res = await c.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(StatementSchema) },
    messages: [{ role: 'user', content }],
  });
  if (res.stop_reason === 'refusal') throw new Error('Claude declined to read this statement.');
  if (res.stop_reason === 'max_tokens') throw new Error('The statement was too long to read in one go.');
  if (!res.parsed_output) throw new Error('Could not read the statement. Try pasting its text instead.');
  return res.parsed_output;
}

export async function extractStatementFromPdf(base64Pdf: string, cardName: string): Promise<ExtractedStatement> {
  return extract([
    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf } },
    { type: 'text', text: instructions(cardName) },
  ]);
}

/** `keyOverride` is only for the self-test, which checks the API path with a dummy key. */
export async function extractStatementFromText(text: string, cardName: string, keyOverride?: string): Promise<ExtractedStatement> {
  return extract([{ type: 'text', text: `${instructions(cardName)}\n\n<statement>\n${text}\n</statement>` }], keyOverride);
}

export function friendlyError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'Your Claude API key was rejected. Check it in Settings.';
  if (e instanceof Anthropic.RateLimitError) return 'Claude is rate-limiting requests. Try again in a minute.';
  if (e instanceof Anthropic.BadRequestError) {
    return /password|encrypt/i.test(e.message)
      ? 'This PDF is password-protected. Open it with the password, save or print an unlocked copy, and upload that (or paste the text).'
      : `Claude could not process this file: ${e.message}`;
  }
  if (e instanceof Anthropic.APIConnectionError) return 'No connection to the Claude API. Check your internet.';
  if (e instanceof Anthropic.APIError) return `Claude API error ${e.status ?? ''}: ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}

const TermsChangeSchema = z.object({
  meaningful: z.boolean().describe('false if only layout, navigation, dates, banners or marketing copy changed'),
  summary: z.string().describe('Plain-English summary of what changed in fees, rewards, caps, exclusions, lounge access, spend requirements or milestones; 1-4 short sentences'),
  what_it_means: z.string().describe('What this means for me in practice, one or two sentences'),
  offers: z.array(z.object({
    title: z.string(),
    merchant: z.string(),
    valid_from: z.string().nullable().describe('YYYY-MM-DD or null'),
    valid_to: z.string().nullable().describe('YYYY-MM-DD or null'),
    how_to_use: z.string(),
  })).describe('Time-limited offers among the added lines, if any'),
});
export type TermsChange = z.infer<typeof TermsChangeSchema>;

/** Asks Claude whether changed lines on a card's official page matter to the cardholder. */
export async function summarizeTermsChange(rule: CardRule, removed: string[], added: string[]): Promise<TermsChange> {
  const c = await client();
  const clip = (lines: string[]) => lines.join('\n').slice(0, 12_000);
  const res = await c.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(TermsChangeSchema) },
    messages: [{
      role: 'user',
      content: `The official benefits page for my "${rule.name}" credit card changed. My app currently assumes:
${JSON.stringify({ reward: rule.reward, lounge: rule.lounge, spend_gate: rule.spend_gate, fee: rule.fee_note, fee_waiver_spend: rule.fee_waiver_spend })}

Lines removed from the page:
<removed>
${clip(removed)}
</removed>

Lines added to the page:
<added>
${clip(added)}
</added>

Did anything change that matters to me (fees, reward rates, caps, exclusions, lounge access, spend requirements, milestones)? Ignore cosmetic changes.`,
    }],
  });
  if (res.stop_reason === 'refusal' || !res.parsed_output) throw new Error(`No summary (stop reason ${res.stop_reason}).`);
  return res.parsed_output;
}
