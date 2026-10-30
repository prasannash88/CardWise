import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable } from 'react-native';
import { Button, H2, KV, Panel, Progress, Row, Screen, T, Tag } from '../../components/ui';
import { pretty, prettyShort } from '../../lib/dates';
import { loadOverview } from '../../lib/overview';
import { inr } from '../../lib/rewards';
import { categoryLabel } from '../../lib/rules';
import { useLive } from '../../lib/useLive';

export default function CardDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = useLive(() => loadOverview(), [id]);
  const s = data?.summaries.find((x) => x.card.id === Number(id));
  if (!data) return <Screen><T sub>Loading…</T></Screen>;
  if (!s) return <Screen><T>Card not found.</T></Screen>;
  const { card, rule, cycle, bill, gate } = s;
  const primarySummary = s.primary ? data.summaries.find((x) => x.card.id === s.primary!.id) : undefined;

  return (
    <Screen>
      <Stack.Screen options={{
        title: card.name,
        headerRight: () => <Button small kind="secondary" title="Edit" onPress={() => router.push({ pathname: '/card/edit', params: { id: card.id } })} />,
      }} />

      <Panel>
        <Row>
          <T bold>{card.bank} · {card.network}</T>
          {card.last4 ? <T sub>··{card.last4}</T> : null}
        </Row>
        {s.tag ? <Tag label={s.tag.label} tone={s.tag.tone} /> : null}
      </Panel>

      {card.is_addon ? (
        <Panel>
          <T bold>Add-on card{card.addon_holder ? ` for ${card.addon_holder}` : ''}</T>
          <T sub>Linked to {s.primary?.name ?? 'its primary card'}.</T>
          <KV k="Shares" v="Bill, credit limit, rewards, spend gate, fee waiver" />
          <KV k="Lounge access" v={rule?.watch_outs.some((w) => /primary only/i.test(w)) ? 'Not included (primary only)' : 'Check MITC; usually primary only'} tone="warn" />
          {primarySummary ? <Button small kind="secondary" title={`Open ${s.primary!.name}`} onPress={() => router.push(`/card/${s.primary!.id}`)} /> : null}
        </Panel>
      ) : null}

      <H2>Dates</H2>
      <Panel>
        <KV k="Next statement" v={`${pretty(cycle.nextStatement)} (${cycle.daysToStatement} days)`} />
        <KV k="That bill is due" v={pretty(cycle.nextDue)} />
        <KV k="Interest-free days if you buy today" v={`${cycle.interestFreeDays}`} />
        <KV k="Best day to buy" v={`${prettyShort(cycle.bestDayToBuy)} → ${cycle.bestDayInterestFree} days`} tone="good" />
        <KV k="Worst day to buy" v={`${prettyShort(cycle.worstDayToBuy)} → ${cycle.worstDayInterestFree} days`} tone="warn" />
        <KV k="Last bill" v={`${pretty(bill.statementDate)}, due ${pretty(bill.due)}${bill.paid ? ' · paid' : ''}`} tone={!bill.paid && bill.daysToDue < 5 && bill.daysToDue >= 0 ? 'bad' : undefined} />
        {bill.payBy !== bill.due ? <T tone="warn" size={13}>Due date falls on a weekend/holiday: pay by {pretty(bill.payBy)}.</T> : null}
        <T sub size={12}>Statement day {card.statement_day}, due {card.due_gap_days} days later.{bill.fromStatement ? ' Last bill dates come from your statement.' : ''}</T>
      </Panel>

      <H2>This cycle</H2>
      <Panel>
        <KV k="Spent" v={inr(s.cycleSpend)} />
        {rule ? <KV k="Rewards earned" v={`${s.cyclePoints} ${rule.reward.currency} ≈ ${inr(s.cycleValue)}`} tone="good" /> : null}
        {s.caps.map((c) => (
          <KV key={c.label} k={`${c.label} cap (${c.period})`} v={`${c.remaining} of ${c.max} left`} tone={c.remaining === 0 ? 'bad' : undefined} />
        ))}
      </Panel>

      {gate ? (
        <>
          <H2>Lounge spend gate</H2>
          <Panel>
            <KV k="Target" v={`${inr(gate.amount)} per ${gate.window === 'billing_cycle' ? 'billing cycle' : gate.window === 'calendar_month' ? 'month' : 'quarter'}`} />
            <T sub>Current window {prettyShort(gate.current.start)}–{prettyShort(gate.current.end)}</T>
            <Progress pct={gate.current.pct} tone={gate.current.remaining === 0 ? 'good' : gate.atRisk ? 'bad' : 'accent'} />
            <T sub>{inr(gate.current.spent)} spent · {gate.current.remaining ? `${inr(gate.current.remaining)} to go, ≈${inr(gate.current.perDayNeeded)}/day` : 'met'}</T>
            <KV k="Previous window" v={`${inr(gate.previous.spent)} · ${gate.previous.met ? 'met' : 'not met'}`} tone={gate.previous.met ? 'good' : 'bad'} />
            <KV k="Lounge now" v={gate.unlockedNow ? (gate.overridden ? 'Unlocked (you marked it)' : 'Unlocked') : 'Locked'} tone={gate.unlockedNow ? 'good' : 'bad'} />
            {rule?.spend_gate?.note ? <T sub size={12}>{rule.spend_gate.note}</T> : null}
          </Panel>
        </>
      ) : null}

      {s.quotas.length ? (
        <>
          <H2>Lounge quota</H2>
          <Panel onPress={() => router.push('/lounge')}>
            {s.quotas.map((q) => (
              <KV key={q.type + q.period} k={`${q.type === 'domestic' ? 'Domestic' : 'International'} (per ${q.period})`}
                v={q.locked ? 'Locked' : `${q.left ?? 'Unlimited'} left · resets ${prettyShort(q.resetsOn)}`}
                tone={q.locked ? 'bad' : undefined} />
            ))}
          </Panel>
        </>
      ) : null}

      {s.feeWaiver || card.annual_fee ? (
        <>
          <H2>Annual fee</H2>
          <Panel>
            <KV k="Fee" v={rule?.fee_note ?? inr(card.annual_fee ?? 0)} />
            {s.feeWaiver ? (
              <>
                <T sub>Waiver: spend {inr(s.feeWaiver.target)} between {prettyShort(s.feeWaiver.from)} and {pretty(s.feeWaiver.to)}</T>
                <Progress pct={s.feeWaiver.pct} tone={s.feeWaiver.pct >= 1 ? 'good' : 'accent'} />
                <T sub>{inr(s.feeWaiver.spent)} spent ({Math.round(s.feeWaiver.pct * 100)}%)</T>
              </>
            ) : null}
          </Panel>
        </>
      ) : null}

      {rule ? (
        <>
          <H2>Reward rates</H2>
          <Panel>
            {Object.entries(rule.reward.rates).map(([cat, r]) => (
              <KV key={cat} k={cat === 'default' ? 'Everything else' : categoryLabel(cat)}
                v={`${r} per ${inr(rule.reward.per_amount)} (${((r * rule.reward.rupee_value) / rule.reward.per_amount * 100).toFixed(1)}%)`} />
            ))}
            <T sub size={12}>Excluded: {rule.reward.excluded_categories.map(categoryLabel).join(', ') || 'none'}</T>
            {rule.reward.note ? <T sub size={12}>{rule.reward.note}</T> : null}
          </Panel>
          {rule.milestones.length || rule.perks.length || rule.watch_outs.length ? (
            <Panel>
              {rule.milestones.map((m) => <T key={m.label}>🎯 {m.label}</T>)}
              {rule.perks.map((p) => <T key={p}>✓ {p}</T>)}
              {rule.watch_outs.map((w) => <T key={w} tone="warn">! {w}</T>)}
            </Panel>
          ) : null}
          <Pressable onPress={() => Linking.openURL(rule.source_url)}>
            <T sub size={12} tone="accent">Source: {rule.source_url} (verified {rule.verified_on})</T>
          </Pressable>
          <Pressable onPress={() => Linking.openURL(rule.benefits_url)}>
            <T sub size={12} tone="accent">Official page: {rule.benefits_url}</T>
          </Pressable>
        </>
      ) : <Panel><T sub>No rules linked. Edit the card and pick it from the catalogue to get rewards, gates and lounge tracking.</T></Panel>}

      {s.addons.length ? (
        <>
          <H2>Add-on cards</H2>
          {s.addons.map((a) => (
            <Panel key={a.id} onPress={() => router.push(`/card/${a.id}`)}>
              <T bold>{a.name}{a.last4 ? ` ··${a.last4}` : ''}</T>
              <T sub>{a.addon_holder ?? 'Add-on'} · spends count toward this card's gate and rewards</T>
            </Panel>
          ))}
        </>
      ) : null}

      <H2 right={<Button small kind="secondary" title="Upload" onPress={() => router.push({ pathname: '/statement', params: { cardId: card.id } })} />}>Statements</H2>
      {s.statements.length === 0 ? <Panel><T sub>No statements yet. Upload a PDF or enter one manually to get exact due amounts.</T></Panel> : s.statements.slice(0, 6).map((st) => (
        <Panel key={st.id}>
          <Row><T bold>{pretty(st.period_end)}</T><T>{inr(st.total_due)}</T></Row>
          <T sub>Due {pretty(st.due_date)} · min {inr(st.min_due)}{st.paid_on ? ` · paid ${prettyShort(st.paid_on)}` : ''}</T>
        </Panel>
      ))}

      <H2 right={<Button small kind="secondary" title="+ Spend" onPress={() => router.push({ pathname: '/txn/edit', params: { cardId: card.id } })} />}>Recent spends</H2>
      {s.txns.slice(0, 10).map((t) => (
        <Panel key={t.id} onPress={() => router.push({ pathname: '/txn/edit', params: { id: t.id } })}>
          <Row><T>{t.merchant || categoryLabel(t.category)}</T><T bold tone={t.amount < 0 ? 'good' : undefined}>{inr(t.amount, 2)}</T></Row>
          <T sub>{prettyShort(t.date)} · {categoryLabel(t.category)} · {t.source}</T>
        </Panel>
      ))}
    </Screen>
  );
}
