import { useState } from 'react';
import { Alert } from 'react-native';
import { Button, DateField, Empty, Field, H2, KV, Panel, Progress, Row, Screen, Select, T, Tag, Toggle } from '../../components/ui';
import { addLoungeVisit, deleteLoungeVisit, getSetting, setSetting } from '../../db/db';
import { isValidISO, pretty, prettyShort, todayISO } from '../../lib/dates';
import { loadOverview, type GateOverrides, type GateTargets } from '../../lib/overview';
import { inr } from '../../lib/rewards';
import { useLive } from '../../lib/useLive';

export default function Lounge() {
  const { data } = useLive(() => loadOverview());
  const [cardId, setCardId] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [airport, setAirport] = useState('');
  const [type, setType] = useState<'domestic' | 'international'>('domestic');
  const [guest, setGuest] = useState(false);

  if (!data) return <Screen><T sub>Loading…</T></Screen>;
  const loungeCards = data.summaries.filter((s) => !s.card.is_addon && (s.quotas.length || s.gate));
  if (!loungeCards.length) {
    return <Screen><Empty title="No lounge cards yet"><T sub>Add a card with lounge benefits (Scapia, MMT, Adani One, Tata Neu).</T></Empty></Screen>;
  }
  const gated = loungeCards.filter((s) => s.gate);
  const targeted = gated.filter((s) => s.gateTargeted && s.gate!.current.remaining > 0);
  const totalNeeded = targeted.reduce((a, s) => a + s.gate!.current.remaining, 0);

  const setTarget = async (id: number, v: boolean) => {
    const cur = await getSetting<GateTargets>('gate_targets', {});
    await setSetting('gate_targets', { ...cur, [id]: v });
  };
  const setOverride = async (id: number, windowStart: string | null) => {
    const cur = await getSetting<GateOverrides>('gate_overrides', {});
    const next = { ...cur };
    if (windowStart) next[id] = windowStart; else delete next[id];
    await setSetting('gate_overrides', next);
  };

  const log = async () => {
    if (!cardId) return Alert.alert('Pick a card');
    if (!isValidISO(date)) return Alert.alert('Date', 'Use YYYY-MM-DD');
    await addLoungeVisit({ card_id: cardId, date, airport: airport.trim().toUpperCase(), type, guest: guest ? 1 : 0 });
    setAirport('');
    Alert.alert('Logged', 'Lounge visit saved.');
  };

  return (
    <Screen>
      <H2>Visits left</H2>
      {loungeCards.map((s) => (
        <Panel key={s.card.id}>
          <Row>
            <T bold>{s.card.name}</T>
            {s.gate ? <Tag label={s.gate.unlockedNow ? 'Unlocked' : 'Locked'} tone={s.gate.unlockedNow ? 'good' : 'bad'} /> : null}
          </Row>
          {s.quotas.map((q) => (
            <KV key={q.type + q.period} k={`${q.type === 'domestic' ? 'Domestic' : 'International'} · per ${q.period}`}
              v={q.locked ? 'Locked' : `${q.left ?? 'Unlimited'} left · resets ${prettyShort(q.resetsOn)}`} tone={q.locked ? 'bad' : undefined} />
          ))}
          {s.gate && !s.gate.previous.met ? (
            <Row>
              <T sub size={12} style={{ flex: 1 }}>
                Logged spend last window: {inr(s.gate.previous.spent)} of {inr(s.gate.amount)}.
                {s.gate.overridden ? ' You marked it as qualified.' : ' Already qualified? Mark it.'}
              </T>
              <Button small kind="secondary" title={s.gate.overridden ? 'Undo' : 'I qualified'}
                onPress={() => setOverride(s.card.id, s.gate!.overridden ? null : s.gate!.current.start)} />
            </Row>
          ) : null}
        </Panel>
      ))}

      {gated.length ? <H2>Which card unlocks lounge next period</H2> : null}
      {gated.length ? (
        <T sub>
          {targeted.length
            ? `Your targeted gates still need ${inr(totalNeeded)} in total. `
            : 'Turn on "Target this gate" for the ones you plan to hit. '}
          Hitting every gate is about Rs 2.2 lakh a quarter plus Scapia's cycle gate, so pick the ones that matter.
        </T>
      ) : null}
      {gated.map((s) => {
        const g = s.gate!;
        const done = g.current.remaining === 0;
        return (
          <Panel key={s.card.id}>
            <Row>
              <T bold>{s.card.name}</T>
              <T sub>{inr(g.current.spent)} / {inr(g.amount)}</T>
            </Row>
            <Progress pct={g.current.pct} tone={done ? 'good' : g.atRisk ? 'bad' : 'accent'} />
            <T sub>
              {done
                ? (s.rule?.spend_gate?.unlocks === 'on_completion' ? 'Met: voucher earned for this quarter.' : `Met: lounge unlocked for the period after ${prettyShort(g.current.end)}.`)
                : `${inr(g.current.remaining)} by ${pretty(g.current.end)} · ≈${inr(g.current.perDayNeeded)}/day for ${g.current.daysLeft} days`}
            </T>
            <Toggle label="Target this gate" value={s.gateTargeted} onChange={(v) => setTarget(s.card.id, v)} />
          </Panel>
        );
      })}

      <H2>Log a visit</H2>
      <Panel>
        <Select label="Card" value={cardId} onChange={setCardId}
          options={loungeCards.filter((s) => s.quotas.length).map((s) => ({ label: s.card.name, value: s.card.id }))} />
        <DateField label="Date" value={date} onChange={setDate} />
        <Field label="Airport" value={airport} onChangeText={setAirport} placeholder="e.g. BLR" autoCapitalize="characters" />
        <Select label="Type" value={type} onChange={setType}
          options={[{ label: 'Domestic', value: 'domestic' }, { label: 'International', value: 'international' }]} />
        <Toggle label="Guest visit (not counted against your quota)" value={guest} onChange={setGuest} />
        <Button title="Log visit" onPress={log} />
      </Panel>

      {data.visits.length ? <H2>Recent visits</H2> : null}
      {data.visits.slice(0, 15).map((v) => {
        const c = data.cards.find((x) => x.id === v.card_id);
        return (
          <Panel key={v.id}>
            <Row>
              <T>{pretty(v.date)} · {v.airport || '—'}{v.guest ? ' · guest' : ''}</T>
              <Button small kind="danger" title="Delete" onPress={() => deleteLoungeVisit(v.id)} />
            </Row>
            <T sub>{c?.name ?? 'Deleted card'} · {v.type}</T>
          </Panel>
        );
      })}
    </Screen>
  );
}
