import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Button, Chip, Field, H2, Panel, Row, Screen, Select, T, Tag } from '../components/ui';
import { listCards, saveTransaction } from '../db/db';
import { isSmsReadingAvailable, requestSmsPermission } from '../../modules/sms-reader';
import { prettyShort, todayISO } from '../lib/dates';
import { refreshNotifications } from '../lib/notifications';
import { inr, isExcluded } from '../lib/rewards';
import { categorize, categoryLabel, getRules, ruleForCard } from '../lib/rules';
import { matchCard, parseBankSms } from '../lib/sms';
import { dismissSms, markScanned, scanSms, type SmsCandidate } from '../lib/smsImport';
import type { Card } from '../lib/types';
import { useLive } from '../lib/useLive';

const COMMON = ['other', 'online_shopping', 'shopping_partners', 'groceries', 'dining', 'travel', 'upi', 'fuel', 'utilities', 'rent', 'insurance'];

export default function SmsImport() {
  const { data: cards } = useLive(() => listCards());
  const [items, setItems] = useState<SmsCandidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [pasted, setPasted] = useState('');

  const scan = async () => {
    setBusy(true);
    try {
      if (!(await requestSmsPermission())) {
        Alert.alert('Permission needed', 'Allow SMS access to read bank alerts, or paste a message below.');
        return;
      }
      setItems(await scanSms());
    } catch (e) {
      Alert.alert('Could not read SMS', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const parsePasted = () => {
    const p = parseBankSms(pasted, todayISO());
    if (!p) return Alert.alert('Not a card spend', 'That message does not look like a card spend alert (OTP messages are always ignored).');
    const card = matchCard(p, cards ?? [], (c) => ruleForCard(c)?.issuer_sms_names ?? []);
    setItems([...(items ?? []), { smsId: `paste-${Date.now()}`, parsed: p, card, category: categorize(p.merchant), duplicate: false }]);
    setPasted('');
  };

  const update = (i: number, patch: Partial<SmsCandidate>) =>
    setItems((cur) => cur!.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const confirm = async (i: number) => {
    const it = items![i];
    if (!it.card) return Alert.alert('Pick a card', 'Choose which card this spend was on.');
    const rule = ruleForCard(it.card);
    await saveTransaction({
      card_id: it.card.id, date: it.parsed.date, amount: it.parsed.amount, merchant: it.parsed.merchant,
      category: it.category, source: 'sms', counts_for_gate: rule && isExcluded(rule, it.category) ? 0 : 1,
      sms_id: it.smsId.startsWith('paste-') ? null : it.smsId,
    });
    setItems((cur) => cur!.filter((_, j) => j !== i));
  };

  const skip = async (i: number) => {
    const it = items![i];
    if (!it.smsId.startsWith('paste-')) await dismissSms([it.smsId]);
    setItems((cur) => cur!.filter((_, j) => j !== i));
  };

  const confirmAll = async () => {
    for (let i = items!.length - 1; i >= 0; i--) {
      if (items![i].card && !items![i].duplicate) await confirm(i);
    }
    await markScanned();
    refreshNotifications();
  };

  const available = isSmsReadingAvailable();

  return (
    <Screen>
      <Panel>
        <T>Reads card spend alerts from your SMS inbox and shows them here to confirm. OTP messages are ignored entirely and nothing leaves your phone.</T>
        {available ? (
          <Button title={busy ? 'Reading…' : 'Scan SMS inbox'} onPress={scan} disabled={busy} />
        ) : (
          <T tone="warn">SMS reading works in the installed CardWise APK, not in Expo Go. You can paste a message below instead.</T>
        )}
      </Panel>

      <Panel>
        <Field label="Or paste a bank SMS" value={pasted} onChangeText={setPasted} multiline />
        <Button title="Parse" kind="secondary" onPress={parsePasted} disabled={!pasted.trim()} />
      </Panel>

      {items ? (
        <>
          <H2 right={items.length ? <Button small title="Save all matched" onPress={confirmAll} /> : null}>
            {items.length ? `${items.length} to review` : 'Nothing new'}
          </H2>
          {items.length === 0 ? <Button title="Done" kind="secondary" onPress={markScanned} /> : null}
          {items.map((it, i) => (
            <Panel key={it.smsId}>
              <Row>
                <T bold>{it.parsed.merchant}</T>
                <T bold tone={it.parsed.amount < 0 ? 'good' : undefined}>{inr(it.parsed.amount, 2)}</T>
              </Row>
              <Row style={{ justifyContent: 'flex-start', gap: 6 }}>
                <T sub>{prettyShort(it.parsed.date)} · card ··{it.parsed.last4 ?? '????'}</T>
                {it.duplicate ? <Tag label="Possible duplicate" tone="warn" /> : null}
                {it.parsed.isRefund ? <Tag label="Refund" tone="good" /> : null}
              </Row>
              <CardPicker cards={cards ?? []} value={it.card} onChange={(c) => update(i, { card: c })} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {Array.from(new Set([it.category, ...COMMON])).map((c) => (
                  <Chip key={c} label={categoryLabel(c)} selected={it.category === c} onPress={() => update(i, { category: c })} />
                ))}
              </View>
              <T sub size={12} numberOfLines={3}>{it.parsed.raw}</T>
              <Row>
                <Button small kind="secondary" title="Skip" onPress={() => skip(i)} />
                <Button small title="Save" onPress={() => confirm(i)} />
              </Row>
            </Panel>
          ))}
        </>
      ) : null}
      <T sub size={12}>Categories available: {getRules().categories.length}. Edit any saved spend from the Spends tab.</T>
    </Screen>
  );
}

function CardPicker({ cards, value, onChange }: { cards: Card[]; value: Card | undefined; onChange: (c: Card) => void }) {
  return (
    <Select value={value?.id ?? null} onChange={(id) => onChange(cards.find((c) => c.id === id)!)}
      options={cards.map((c) => ({ label: c.last4 ? `${c.name} ··${c.last4}` : c.name, value: c.id }))} />
  );
}
