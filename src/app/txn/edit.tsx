import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { Button, DateField, Field, Panel, Screen, Select, T, Toggle } from '../../components/ui';
import { deleteTransaction, getDb, listCards, saveTransaction } from '../../db/db';
import { isValidISO, todayISO } from '../../lib/dates';
import { refreshNotifications } from '../../lib/notifications';
import { basePoints, inr, isExcluded, rupeeValue } from '../../lib/rewards';
import { categorize, categoryLabel, getRules, ruleForCard } from '../../lib/rules';
import type { Card, Transaction, TxnSource } from '../../lib/types';

export default function EditTxn() {
  const params = useLocalSearchParams<{ id?: string; cardId?: string }>();
  const editingId = params.id ? Number(params.id) : undefined;
  const [cards, setCards] = useState<Card[]>([]);
  const [cardId, setCardId] = useState<number | null>(params.cardId ? Number(params.cardId) : null);
  const [amount, setAmount] = useState('');
  const [refund, setRefund] = useState(false);
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState('other');
  const [catTouched, setCatTouched] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [counts, setCounts] = useState(true);
  const [countsTouched, setCountsTouched] = useState(false);
  const [note, setNote] = useState('');
  const [source, setSource] = useState<TxnSource>('manual');

  useEffect(() => {
    listCards().then((cs) => {
      setCards(cs);
      if (!cardId && cs.length === 1) setCardId(cs[0].id);
    });
    if (editingId) {
      getDb().then((db) => db.getFirstAsync<Transaction>('SELECT * FROM transactions WHERE id = ?', editingId)).then((t) => {
        if (!t) return;
        setCardId(t.card_id); setAmount(String(Math.abs(t.amount))); setRefund(t.amount < 0); setMerchant(t.merchant);
        setCategory(t.category); setCatTouched(true); setDate(t.date); setCounts(!!t.counts_for_gate); setCountsTouched(true);
        setNote(t.note ?? ''); setSource(t.source);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  const card = cards.find((c) => c.id === cardId);
  const rule = card ? ruleForCard(card.primary_card_id ? cards.find((c) => c.id === card.primary_card_id) ?? card : card) : undefined;

  // Excluded categories don't count toward gates, unless you've overridden it.
  useEffect(() => {
    if (!countsTouched && rule) setCounts(!isExcluded(rule, category));
  }, [rule, category, countsTouched]);

  const onMerchant = (v: string) => {
    setMerchant(v);
    if (!catTouched) setCategory(categorize(v));
  };

  const preview = useMemo(() => {
    const amt = Number(amount);
    if (!rule || !amt) return null;
    const pts = basePoints(rule, refund ? -amt : amt, category);
    return `${pts} ${rule.reward.currency} ≈ ${inr(rupeeValue(rule, pts), 2)} before caps${isExcluded(rule, category) ? ' (excluded category)' : ''}`;
  }, [rule, amount, category, refund]);

  const save = async () => {
    const amt = Number(amount.replace(/,/g, ''));
    if (!cardId) return Alert.alert('Pick a card');
    if (!amt || amt <= 0) return Alert.alert('Amount', 'Enter the amount in rupees.');
    if (!isValidISO(date)) return Alert.alert('Date', 'Use YYYY-MM-DD');
    await saveTransaction({
      card_id: cardId, date, amount: refund ? -amt : amt, merchant: merchant.trim(), category, source,
      counts_for_gate: counts ? 1 : 0, note: note.trim() || null,
    }, editingId);
    refreshNotifications();
    router.back();
  };

  const remove = () => Alert.alert('Delete this spend?', undefined, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { await deleteTransaction(editingId!); router.back(); } },
  ]);

  return (
    <Screen>
      <Panel>
        <Select label="Card" value={cardId} onChange={setCardId} options={cards.map((c) => ({ label: c.name, value: c.id }))} />
        <Field label="Amount (Rs)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        <Toggle label="This is a refund / reversal" value={refund} onChange={setRefund} hint="Refunds reduce rewards and gate progress." />
        <Field label="Merchant" value={merchant} onChangeText={onMerchant} placeholder="e.g. BigBasket" />
        <Select label="Category" value={category} onChange={(c) => { setCategory(c); setCatTouched(true); }}
          options={getRules().categories.map((c) => ({ label: categoryLabel(c), value: c }))} />
        <DateField label="Date" value={date} onChange={setDate} />
        <Toggle label="Counts toward spend gates" value={counts} onChange={(v) => { setCounts(v); setCountsTouched(true); }}
          hint={rule && isExcluded(rule, category) ? `${categoryLabel(category)} is excluded on this card, so it's off by default.` : undefined} />
        <Field label="Note (optional)" value={note} onChangeText={setNote} />
        {preview ? <T sub>{preview}</T> : null}
      </Panel>
      <Button title="Save" onPress={save} />
      {editingId ? <Button title="Delete" kind="danger" onPress={remove} /> : null}
    </Screen>
  );
}
