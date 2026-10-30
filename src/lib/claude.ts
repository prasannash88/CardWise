// Statement reading with the Claude API. The API key lives in the phone's secure storage.
// Only the statement (PDF or pasted text) is sent; never card images.

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';
import { getRules } from './rules';

const KEY = 'anthropic_api_key';
const MODEL = 'claude-opus-5-5';

export async function getApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY);
}
export async function setApiKey(v: string) {
  if (v.trim()) await SecureStore.setItemAsync(KEY, v.trim());
  else await SecureStore.deleteItemAsync(KEY);
}

async function client(): Promise<Anthropic> {
  const apiKey = await getApiKey();
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

async function extract(content: Anthropic.Beta.BetaContentBlockParam[]): Promise<ExtractedStatement> {
  const c = await client();
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

export async function extractStatementFromText(text: string, cardName: string): Promise<ExtractedStatement> {
  return extract([{ type: 'text', text: `${instructions(cardName)}\n\n<statement>\n${text}\n</statement>` }]);
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
