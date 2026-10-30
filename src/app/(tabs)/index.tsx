import { router } from 'expo-router';
import { Alert, View } from 'react-native';
import { Button, Empty, H2, Panel, Progress, Row, Screen, T, Tag } from '../../components/ui';
import { saveStatement } from '../../db/db';
import { addDays, pretty, prettyShort, previousStatementDate, todayISO } from '../../lib/dates';
import { loadOverview, type CardSummary } from '../../lib/overview';
import { inr } from '../../lib/rewards';
import { topSuggestion } from '../../lib/suggest';
import { useLive } from '../../lib/useLive';

async function markPaid(s: CardSummary) {
  const today = todayISO();
  if (s.bill.fromStatement) {
    await saveStatement({ ...s.bill.fromStatement, paid_on: today }, s.bill.fromStatement.id);
  } else {
    await saveStatement({
      card_id: s.card.id,
      period_start: addDays(previousStatementDate(s.bill.statementDate, s.card.statement_day), 1),
      period_end: s.bill.statementDate, total_due: 0, min_due: 0, due_date: s.bill.due, paid_on: today,
    });
  }
}

export default function Home() {
  const { data } = useLive(() => loadOverview());
  if (!data) return <Screen><T sub>Loading…</T></Screen>;

  const primaries = data.summaries.filter((s) => !s.card.is_addon);
  if (!primaries.length) {
    return (
      <Screen>
        <Empty title="Add your first card">
          <T sub>Pick a card from the catalogue, then enter its statement day and due gap from one recent statement.</T>
          <Button title="Add a card" onPress={() => router.push('/card/edit')} />
        </Empty>
      </Screen>
    );
  }

  const bills = primaries
    .filter((s) => !s.bill.paid && s.bill.daysToDue >= -3)
    .sort((a, b) => a.bill.daysToDue - b.bill.daysToDue);
  const bestToday = [...primaries].sort((a, b) => b.cycle.interestFreeDays - a.cycle.interestFreeDays);
  const gates = primaries.filter((s) => s.gate);
  const lounges = primaries.filter((s) => s.quotas.length);
  const tip = topSuggestion(data);

  return (
    <Screen>
      {tip ? (
        <Panel>
          <T sub>Suggestion</T>
          <T bold>{tip}</T>
        </Panel>
      ) : null}

      <Row style={{ gap: 8 }}>
        <View style={{ flex: 1 }}><Button title="+ Spend" onPress={() => router.push('/txn/edit')} /></View>
        <View style={{ flex: 1 }}><Button title="Scan SMS" kind="secondary" onPress={() => router.push('/sms')} /></View>
      </Row>

      <H2>Upcoming due dates</H2>
      {bills.length === 0 ? <Panel><T sub>No unpaid bills right now.</T></Panel> : bills.map((s) => {
        const urgent = s.bill.daysToDue < 5;
        return (
          <Panel key={s.card.id} onPress={() => router.push(`/card/${s.card.id}`)}>
            <Row>
              <T bold>{s.card.name}</T>
              <Tag
                tone={urgent ? 'bad' : 'neutral'}
                label={s.bill.daysToDue < 0 ? `Overdue ${-s.bill.daysToDue}d` : s.bill.daysToDue === 0 ? 'Due today' : `Due in ${s.bill.daysToDue} days`}
              />
            </Row>
            <T sub>
              Due {pretty(s.bill.due)}
              {s.bill.totalDue != null ? ` · ${inr(s.bill.totalDue)} (min ${inr(s.bill.minDue ?? 0)})` : ' · amount from your statement'}
            </T>
            {s.bill.payBy !== s.bill.due ? <T tone="warn" size={13}>Falls on a weekend/holiday: pay by {pretty(s.bill.payBy)}</T> : null}
            <Row style={{ justifyContent: 'flex-end' }}>
              <Button small kind="secondary" title="Mark paid" onPress={() =>
                Alert.alert('Mark as paid?', `${s.card.name} bill due ${pretty(s.bill.due)}`, [
                  { text: 'Cancel', style: 'cancel' }, { text: 'Paid', onPress: () => markPaid(s) },
                ])} />
            </Row>
          </Panel>
        );
      })}

      <H2>Best card to buy with today</H2>
      {bestToday.map((s) => (
        <Panel key={s.card.id} onPress={() => router.push(`/card/${s.card.id}`)}>
          <Row>
            <T bold>{s.card.name}{s.card.last4 ? ` ··${s.card.last4}` : ''}</T>
            <T bold tone="accent">{s.cycle.interestFreeDays} days</T>
          </Row>
          <Row>
            <T sub>Statement {prettyShort(s.cycle.nextStatement)} ({s.cycle.daysToStatement}d) · due {prettyShort(s.cycle.nextDue)}</T>
            {s.tag ? <Tag label={s.tag.label} tone={s.tag.tone} /> : null}
          </Row>
          {s.rule ? (
            <T sub>This cycle: {inr(s.cycleSpend)} spent · {s.cyclePoints} {s.rule.reward.currency} ≈ {inr(s.cycleValue)}</T>
          ) : null}
        </Panel>
      ))}

      {gates.length ? <H2>Spend gates in progress</H2> : null}
      {gates.map((s) => {
        const g = s.gate!;
        const done = g.current.remaining === 0;
        return (
          <Panel key={s.card.id} onPress={() => router.push(`/card/${s.card.id}`)}>
            <Row>
              <T bold>{s.card.name}</T>
              <T sub>{inr(g.current.spent)} / {inr(g.amount)}</T>
            </Row>
            <Progress pct={g.current.pct} tone={done ? 'good' : g.atRisk ? 'bad' : g.close ? 'warn' : 'accent'} />
            <T sub>
              {done ? 'Gate met for this period.' : `${inr(g.current.remaining)} more by ${prettyShort(g.current.end)} · ${g.current.daysLeft} days left · ≈${inr(g.current.perDayNeeded)}/day`}
            </T>
          </Panel>
        );
      })}

      {lounges.length ? <H2>Lounges left this period</H2> : null}
      {lounges.length ? (
        <Panel onPress={() => router.push('/lounge')}>
          {lounges.map((s) => (
            <Row key={s.card.id}>
              <T>{s.card.name}</T>
              <T bold tone={s.quotas.some((q) => q.locked) ? 'bad' : undefined}>
                {s.quotas.map((q) => (q.locked ? 'Locked' : `${q.left ?? '∞'} ${q.type === 'domestic' ? 'dom' : 'intl'}`)).join(' · ')}
              </T>
            </Row>
          ))}
        </Panel>
      ) : null}

      <Button title="Add another card" kind="secondary" onPress={() => router.push('/card/edit')} />
    </Screen>
  );
}
