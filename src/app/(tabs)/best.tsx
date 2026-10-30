import { useMemo, useState } from 'react';
import { Field, H2, Panel, Row, Screen, Select, T, Tag } from '../../components/ui';
import { rankCards } from '../../lib/bestCard';
import { loadOverview } from '../../lib/overview';
import { inr } from '../../lib/rewards';
import { categorize, categoryLabel, getRules } from '../../lib/rules';
import { useLive } from '../../lib/useLive';

const COMMON = ['other', 'online_shopping', 'shopping_partners', 'groceries', 'dining', 'travel', 'upi', 'fuel', 'utilities', 'rent'];

export default function BestCard() {
  const { data } = useLive(() => loadOverview());
  const [amount, setAmount] = useState('2000');
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState('other');
  const [catTouched, setCatTouched] = useState(false);

  const picks = useMemo(() => {
    if (!data) return [];
    const amt = Number(amount) || 0;
    return rankCards(
      data.summaries.map((s) => ({ card: s.card, rule: s.rule, txns: s.txns, gateOverride: !!s.gate?.overridden, targeted: s.gateTargeted })),
      amt, category, merchant, data.offers, data.today,
    );
  }, [data, amount, category, merchant]);

  const cats = Array.from(new Set([...COMMON, category, ...getRules().categories]));

  return (
    <Screen>
      <Panel>
        <Field label="Amount (Rs)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        <Field label="Merchant" value={merchant} placeholder="e.g. Amazon, BigBasket, MakeMyTrip"
          onChangeText={(v) => { setMerchant(v); if (!catTouched) setCategory(categorize(v)); }} />
        <Select label="Category" value={category} onChange={(c) => { setCategory(c); setCatTouched(true); }}
          options={cats.map((c) => ({ label: categoryLabel(c), value: c }))} />
      </Panel>

      <H2>Ranked cards</H2>
      {picks.length === 0 ? <Panel><T sub>Add cards first.</T></Panel> : picks.map((p, i) => (
        <Panel key={p.card.id}>
          <Row>
            <T bold>{i + 1}. {p.card.name}</T>
            <T bold tone={i === 0 ? 'good' : undefined}>{inr(p.value, 2)}</T>
          </Row>
          <T sub>{p.why}</T>
          <Row style={{ justifyContent: 'flex-start', gap: 6 }}>
            {p.offers.length ? <Tag label="Offer" tone="good" /> : null}
            {p.gate && p.gate.current.remaining > 0 ? <Tag label="Builds lounge gate" tone="warn" /> : null}
          </Row>
        </Panel>
      ))}
      <T sub size={12}>Value = rewards after caps in rupees. Ties are broken by open offers, spend gates you're targeting, and interest-free days.</T>
    </Screen>
  );
}
