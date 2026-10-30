import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert } from 'react-native';
import { Button, DateField, Field, H2, Panel, Row, Screen, Select, T, Toggle } from '../components/ui';
import { isDuplicateTxn, listCards, saveCard, saveStatement, saveTransaction } from '../db/db';
import { diffDays, isValidISO, prettyShort, statementDateIn } from '../lib/dates';
import { extractStatementFromPdf, extractStatementFromText, friendlyError, getApiKey, type ExtractedStatement } from '../lib/claude';
import { refreshNotifications } from '../lib/notifications';
import { inr, isExcluded } from '../lib/rewards';
import { categoryLabel, getRules, ruleForCard } from '../lib/rules';
import type { Card } from '../lib/types';
import { useLive } from '../lib/useLive';

interface ReviewTxn { date: string; merchant: string; amount: number; category: string; include: boolean; duplicate: boolean }

export default function StatementScreen() {
  const params = useLocalSearchParams<{ cardId?: string }>();
  const { data: cards } = useLive(() => listCards());
  const [cardId, setCardId] = useState<number | null>(params.cardId ? Number(params.cardId) : null);
  const [busy, setBusy] = useState(false);
  const [pasted, setPasted] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [header, setHeader] = useState<{ period_start: string; period_end: string; total_due: string; min_due: string; due_date: string } | null>(null);
  const [txns, setTxns] = useState<ReviewTxn[]>([]);

  const card = cards?.find((c) => c.id === cardId);

  const load = async (ex: ExtractedStatement, c: Card) => {
    if (ex.card_last4 && c.last4 && ex.card_last4 !== c.last4) {
      Alert.alert('Different card?', `The statement shows a card ending ${ex.card_last4}, but ${c.name} ends ${c.last4}. Check before saving.`);
    }
    setHeader({
      period_start: ex.period_start, period_end: ex.period_end, total_due: String(ex.total_due),
      min_due: String(ex.min_due), due_date: ex.due_date,
    });
    const known = new Set(getRules().categories);
    const rows: ReviewTxn[] = [];
    for (const t of ex.transactions) {
      const duplicate = await isDuplicateTxn(c.id, t.date, t.amount);
      rows.push({ ...t, category: known.has(t.category) ? t.category : 'other', include: !duplicate, duplicate });
    }
    setTxns(rows);
  };

  const run = async (fn: (c: Card) => Promise<ExtractedStatement>) => {
    if (!card) return Alert.alert('Pick a card first');
    if (!(await getApiKey())) return Alert.alert('Claude API key needed', 'Add your key in Settings, or enter the statement manually.');
    setBusy(true);
    try {
      await load(await fn(card), card);
    } catch (e) {
      Alert.alert('Could not read statement', friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const pickPdf = () => run(async (c) => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', base64: true, copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]?.base64) throw new Error('No PDF selected.');
    return extractStatementFromPdf(res.assets[0].base64, c.name);
  });

  const manual = () => {
    setHeader({ period_start: '', period_end: '', total_due: '', min_due: '', due_date: '' });
    setTxns([]);
  };

  const save = async () => {
    if (!card || !header) return;
    const { period_start, period_end, due_date } = header;
    if (![period_start, period_end, due_date].every(isValidISO)) return Alert.alert('Dates', 'Use YYYY-MM-DD for all three dates.');
    await saveStatement({
      card_id: card.id, period_start, period_end, total_due: Number(header.total_due) || 0,
      min_due: Number(header.min_due) || 0, due_date, paid_on: null,
    });
    const rule = ruleForCard(card);
    let n = 0;
    for (const t of txns.filter((x) => x.include)) {
      await saveTransaction({
        card_id: card.id, date: t.date, amount: t.amount, merchant: t.merchant, category: t.category, source: 'statement',
        counts_for_gate: rule && isExcluded(rule, t.category) ? 0 : 1,
      });
      n++;
    }
    // Correct the cycle if the real statement disagrees with the card's settings.
    const realDay = Number(period_end.slice(8, 10));
    const realGap = diffDays(due_date, period_end);
    const expected = statementDateIn(Number(period_end.slice(0, 4)), Number(period_end.slice(5, 7)), card.statement_day);
    const finish = () => { refreshNotifications(); router.back(); };
    if (expected !== period_end || realGap !== card.due_gap_days) {
      Alert.alert(
        'Update billing dates?',
        `Saved ${n} spends. This statement closed on day ${realDay} with a ${realGap}-day due gap; the card is set to day ${card.statement_day} and ${card.due_gap_days} days.`,
        [
          { text: 'Keep', style: 'cancel', onPress: finish },
          {
            text: 'Update card', onPress: async () => {
              const { id: _id, ...rest } = card;
              await saveCard({ ...rest, statement_day: expected !== period_end ? realDay : card.statement_day, due_gap_days: realGap }, card.id);
              finish();
            },
          },
        ],
      );
    } else {
      Alert.alert('Saved', `Statement and ${n} spends saved.`, [{ text: 'OK', onPress: finish }]);
    }
  };

  return (
    <Screen>
      <Panel>
        <Select label="Card" value={cardId} onChange={setCardId}
          options={(cards ?? []).filter((c) => !c.is_addon).map((c) => ({ label: c.name, value: c.id }))} />
        <T sub size={12}>
          The PDF (or text) goes to the Claude API to pull out the totals, due date and spends. Password-protected PDFs: open it with
          the password, save an unlocked copy, and upload that, or paste the text instead.
        </T>
        {busy ? <ActivityIndicator /> : (
          <>
            <Button title="Upload statement PDF" onPress={pickPdf} disabled={!card} />
            <Button title={showPaste ? 'Hide text box' : 'Paste statement text'} kind="secondary" onPress={() => setShowPaste(!showPaste)} />
            <Button title="Enter manually" kind="secondary" onPress={manual} disabled={!card} />
          </>
        )}
        {showPaste ? (
          <>
            <Field label="Statement text" value={pasted} onChangeText={setPasted} multiline />
            <Button title="Read with Claude" disabled={!pasted.trim() || !card || busy}
              onPress={() => run((c) => extractStatementFromText(pasted, c.name))} />
          </>
        ) : null}
      </Panel>

      {header ? (
        <>
          <H2>Review</H2>
          <Panel>
            <DateField label="Period start" value={header.period_start} onChange={(v) => setHeader({ ...header, period_start: v })} />
            <DateField label="Statement date (period end)" value={header.period_end} onChange={(v) => setHeader({ ...header, period_end: v })} />
            <DateField label="Due date (as printed)" value={header.due_date} onChange={(v) => setHeader({ ...header, due_date: v })} />
            <Field label="Total due (Rs)" value={header.total_due} onChangeText={(v) => setHeader({ ...header, total_due: v })} keyboardType="decimal-pad" />
            <Field label="Minimum due (Rs)" value={header.min_due} onChangeText={(v) => setHeader({ ...header, min_due: v })} keyboardType="decimal-pad" />
          </Panel>
          {txns.length ? <H2>{txns.filter((t) => t.include).length} of {txns.length} spends selected</H2> : null}
          {txns.map((t, i) => (
            <Panel key={i}>
              <Row>
                <T style={{ flex: 1 }} numberOfLines={1}>{t.merchant}</T>
                <T bold tone={t.amount < 0 ? 'good' : undefined}>{inr(t.amount, 2)}</T>
              </Row>
              <T sub>{prettyShort(t.date)} · {categoryLabel(t.category)}{t.duplicate ? ' · already logged' : ''}</T>
              <Toggle label="Include" value={t.include} onChange={(v) => setTxns(txns.map((x, j) => (j === i ? { ...x, include: v } : x)))} />
            </Panel>
          ))}
          <Button title="Save statement" onPress={save} />
        </>
      ) : null}
    </Screen>
  );
}
