import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, Chip, Empty, H2, Panel, Row, Screen, T } from '../../components/ui';
import { listCards, listTransactions } from '../../db/db';
import { monthRange, prettyShort, todayISO, addDays } from '../../lib/dates';
import { inr } from '../../lib/rewards';
import { categoryLabel } from '../../lib/rules';
import { useLive } from '../../lib/useLive';

type RangeKey = 'month' | 'last' | '90' | 'all';

export default function Transactions() {
  const [cardId, setCardId] = useState<number | null>(null);
  const [range, setRange] = useState<RangeKey>('month');
  const { data } = useLive(async () => {
    const today = todayISO();
    const r = range === 'month' ? monthRange(today)
      : range === 'last' ? monthRange(addDays(monthRange(today).start, -1))
      : range === '90' ? { start: addDays(today, -90), end: today } : null;
    const [cards, txns] = await Promise.all([
      listCards(),
      listTransactions({ cardIds: cardId ? [cardId] : undefined, from: r?.start, to: r?.end }),
    ]);
    return { cards, txns };
  }, [cardId, range]);

  if (!data) return <Screen><T sub>Loading…</T></Screen>;
  const { cards, txns } = data;
  const byCat = new Map<string, number>();
  const byCard = new Map<number, number>();
  for (const t of txns) {
    byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amount);
    byCard.set(t.card_id, (byCard.get(t.card_id) ?? 0) + t.amount);
  }
  const total = txns.reduce((a, t) => a + t.amount, 0);

  return (
    <Screen>
      <Row style={{ gap: 8 }}>
        <View style={{ flex: 1 }}><Button title="+ Spend" onPress={() => router.push({ pathname: '/txn/edit', params: cardId ? { cardId } : {} })} /></View>
        <View style={{ flex: 1 }}><Button title="Scan SMS" kind="secondary" onPress={() => router.push('/sms')} /></View>
        <View style={{ flex: 1 }}><Button title="Statement" kind="secondary" onPress={() => router.push({ pathname: '/statement', params: cardId ? { cardId } : {} })} /></View>
      </Row>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip label="All cards" selected={cardId === null} onPress={() => setCardId(null)} />
        {cards.map((c) => <Chip key={c.id} label={c.name} selected={cardId === c.id} onPress={() => setCardId(c.id)} />)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {([['month', 'This month'], ['last', 'Last month'], ['90', '90 days'], ['all', 'All']] as const).map(([k, l]) => (
          <Chip key={k} label={l} selected={range === k} onPress={() => setRange(k)} />
        ))}
      </View>

      {txns.length === 0 ? <Empty title="No spends in this view" /> : (
        <>
          <Panel>
            <Row><T bold>Total</T><T bold>{inr(total)}</T></Row>
            {cardId === null ? [...byCard.entries()].sort((a, b) => b[1] - a[1]).map(([id, amt]) => (
              <Row key={id}><T sub>{cards.find((c) => c.id === id)?.name ?? 'Deleted card'}</T><T>{inr(amt)}</T></Row>
            )) : null}
          </Panel>
          <Panel>
            <T bold>By category</T>
            {[...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
              <Row key={cat}><T sub>{categoryLabel(cat)}</T><T>{inr(amt)}</T></Row>
            ))}
          </Panel>
          <H2>Spends</H2>
          {txns.map((t) => (
            <Panel key={t.id} onPress={() => router.push({ pathname: '/txn/edit', params: { id: t.id } })}>
              <Row>
                <T numberOfLines={1} style={{ flex: 1 }}>{t.merchant || categoryLabel(t.category)}</T>
                <T bold tone={t.amount < 0 ? 'good' : undefined}>{inr(t.amount, 2)}</T>
              </Row>
              <T sub>
                {prettyShort(t.date)} · {cards.find((c) => c.id === t.card_id)?.name ?? '?'} · {categoryLabel(t.category)} · {t.source}
                {t.counts_for_gate ? '' : ' · not counted for gates'}
              </T>
            </Panel>
          ))}
        </>
      )}
    </Screen>
  );
}
