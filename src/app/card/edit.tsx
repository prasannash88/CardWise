import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Button, Field, Panel, Screen, Select, T, Toggle } from '../../components/ui';
import { deleteCard, getCard, listCards, saveCard } from '../../db/db';
import { refreshNotifications } from '../../lib/notifications';
import { getRules, ruleById } from '../../lib/rules';
import type { Card } from '../../lib/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function EditCard() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editingId = id ? Number(id) : undefined;
  const [cards, setCards] = useState<Card[]>([]);
  const [ruleId, setRuleId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [bank, setBank] = useState('');
  const [network, setNetwork] = useState('');
  const [last4, setLast4] = useState('');
  const [statementDay, setStatementDay] = useState('');
  const [dueGap, setDueGap] = useState('');
  const [limit, setLimit] = useState('');
  const [fee, setFee] = useState('');
  const [feeMonth, setFeeMonth] = useState<number | null>(null);
  const [isAddon, setIsAddon] = useState(false);
  const [primaryId, setPrimaryId] = useState<number | null>(null);
  const [holder, setHolder] = useState('');

  useEffect(() => {
    listCards().then(setCards);
    if (editingId) {
      getCard(editingId).then((c) => {
        if (!c) return;
        setRuleId(c.rule_id); setName(c.name); setBank(c.bank); setNetwork(c.network); setLast4(c.last4);
        setStatementDay(String(c.statement_day)); setDueGap(String(c.due_gap_days));
        setLimit(c.credit_limit != null ? String(c.credit_limit) : ''); setFee(c.annual_fee != null ? String(c.annual_fee) : '');
        setFeeMonth(c.fee_due_month); setIsAddon(!!c.is_addon); setPrimaryId(c.primary_card_id); setHolder(c.addon_holder ?? '');
      });
    }
  }, [editingId]);

  const pickRule = (rid: string) => {
    const r = ruleById(rid);
    setRuleId(rid);
    if (!r) return;
    setName(r.name); setBank(r.bank); setNetwork(r.network); setFee(String(r.annual_fee));
  };

  const save = async () => {
    const sd = Number(statementDay);
    const gap = Number(dueGap);
    if (!name.trim()) return Alert.alert('Name needed', 'Give the card a name.');
    if (last4 && !/^\d{4}$/.test(last4)) return Alert.alert('Last 4 digits', 'Enter exactly the last 4 digits (never the full number).');
    if (!Number.isInteger(sd) || sd < 1 || sd > 31) return Alert.alert('Statement day', 'Enter a day between 1 and 31.');
    if (!Number.isInteger(gap) || gap < 1 || gap > 60) return Alert.alert('Due gap', 'Enter the days between statement date and due date (e.g. 18).');
    if (isAddon && !primaryId) return Alert.alert('Primary card', 'Choose the primary card this add-on belongs to.');
    const newId = await saveCard({
      rule_id: ruleId, name: name.trim(), bank: bank.trim(), network: network.trim(), last4,
      statement_day: sd, due_gap_days: gap, credit_limit: limit ? Number(limit) : null,
      annual_fee: fee ? Number(fee) : null, fee_due_month: feeMonth, is_addon: isAddon ? 1 : 0,
      primary_card_id: isAddon ? primaryId : null, addon_holder: isAddon ? holder.trim() || null : null,
    }, editingId);
    refreshNotifications();
    if (editingId) router.back();
    else router.replace(`/card/${newId}`);
  };

  const remove = () => Alert.alert('Delete card?', 'This also deletes its spends, statements and lounge visits.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { await deleteCard(editingId!); refreshNotifications(); router.dismissAll(); } },
  ]);

  const usedRules = new Set(cards.filter((c) => c.id !== editingId && !c.is_addon).map((c) => c.rule_id));
  const ruleOptions = getRules().cards
    .filter((r) => !usedRules.has(r.id) || r.id === ruleId || isAddon)
    .map((r) => ({ label: r.name, value: r.id }));

  return (
    <Screen>
      <Panel>
        <Select label="From your catalogue (rules.json)" options={ruleOptions} value={ruleId} onChange={pickRule} />
        <Field label="Card name" value={name} onChangeText={setName} />
        <Field label="Bank" value={bank} onChangeText={setBank} />
        <Field label="Network" value={network} onChangeText={setNetwork} />
        <Field label="Last 4 digits" value={last4} onChangeText={(v) => setLast4(v.replace(/\D/g, '').slice(0, 4))}
          keyboardType="number-pad" maxLength={4} hint="Only the last 4. Never enter the full number, CVV or expiry." />
      </Panel>
      <Panel>
        <T bold>Billing</T>
        <Field label="Statement day (1–31)" value={statementDay} onChangeText={setStatementDay} keyboardType="number-pad"
          hint="Day of month your statement is generated. 29–31 use the last day in shorter months." />
        <Field label="Due gap (days after statement)" value={dueGap} onChangeText={setDueGap} keyboardType="number-pad"
          hint="Read it off one past statement: due date minus statement date, e.g. 18." />
        <Field label="Credit limit (optional)" value={limit} onChangeText={setLimit} keyboardType="numeric" />
        <Field label="Annual fee (Rs)" value={fee} onChangeText={setFee} keyboardType="numeric" />
        <Select label="Fee charged in (starts the fee-waiver year)" value={feeMonth}
          options={MONTHS.map((m, i) => ({ label: m, value: i + 1 }))} onChange={setFeeMonth} />
      </Panel>
      <Panel>
        <Toggle label="This is an add-on card" value={isAddon} onChange={setIsAddon}
          hint="Add-on spends count toward the primary card's gates, caps and fee waiver." />
        {isAddon ? (
          <>
            <Select label="Primary card" value={primaryId}
              options={cards.filter((c) => !c.is_addon && c.id !== editingId).map((c) => ({ label: c.name, value: c.id }))}
              onChange={setPrimaryId} />
            <Field label="Add-on holder" value={holder} onChangeText={setHolder} placeholder="e.g. spouse" />
          </>
        ) : null}
      </Panel>
      <Button title="Save card" onPress={save} />
      {editingId ? <Button title="Delete card" kind="danger" onPress={remove} /> : null}
    </Screen>
  );
}
