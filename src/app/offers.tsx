import { useState } from 'react';
import { Alert } from 'react-native';
import { Button, DateField, Field, H2, Panel, Row, Screen, Select, T, Tag, Toggle } from '../components/ui';
import { deleteOffer, listCards, listOffers, saveOffer, setOfferUsed } from '../db/db';
import { addDays, diffDays, isValidISO, pretty, todayISO } from '../lib/dates';
import { refreshNotifications } from '../lib/notifications';
import { useLive } from '../lib/useLive';

export default function Offers() {
  const { data } = useLive(async () => ({ offers: await listOffers(), cards: await listCards() }));
  const [adding, setAdding] = useState(false);
  const [showUsed, setShowUsed] = useState(false);
  const [cardId, setCardId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [merchant, setMerchant] = useState('');
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState('');
  const [how, setHow] = useState('');

  if (!data) return <Screen><T sub>Loading…</T></Screen>;
  const today = todayISO();
  const visible = data.offers.filter((o) => (showUsed ? true : !o.used && (!o.valid_to || o.valid_to >= today)));

  const add = async () => {
    if (!title.trim()) return Alert.alert('Title needed');
    if ((from && !isValidISO(from)) || (to && !isValidISO(to))) return Alert.alert('Dates', 'Use YYYY-MM-DD');
    await saveOffer({ card_id: cardId, title: title.trim(), merchant: merchant.trim(), valid_from: from || null, valid_to: to || null, how_to_use: how.trim(), used: 0, source: 'manual' });
    setTitle(''); setMerchant(''); setTo(''); setHow(''); setAdding(false);
    refreshNotifications();
  };

  return (
    <Screen>
      {adding ? (
        <Panel>
          <Select label="Card" value={cardId} onChange={setCardId} options={data.cards.filter((c) => !c.is_addon).map((c) => ({ label: c.name, value: c.id }))} />
          <Field label="Offer" value={title} onChangeText={setTitle} placeholder="e.g. 10% off on Swiggy, max Rs 100" />
          <Field label="Merchant" value={merchant} onChangeText={setMerchant} hint="Used to surface the offer on the Best card screen." />
          <DateField label="Valid from" value={from} onChange={setFrom} />
          <Field label="Valid to (YYYY-MM-DD)" value={to} onChangeText={setTo} autoCapitalize="none" placeholder="optional" />
          <Field label="How to use" value={how} onChangeText={setHow} multiline />
          <Button title="Save offer" onPress={add} />
          <Button title="Cancel" kind="secondary" onPress={() => setAdding(false)} />
        </Panel>
      ) : <Button title="+ Add offer" onPress={() => setAdding(true)} />}

      <Toggle label="Show used and expired" value={showUsed} onChange={setShowUsed} />
      <H2>{visible.length} offer{visible.length === 1 ? '' : 's'}</H2>
      {visible.map((o) => {
        const card = data.cards.find((c) => c.id === o.card_id);
        const left = o.valid_to ? diffDays(o.valid_to, today) : null;
        const expired = left !== null && left < 0;
        return (
          <Panel key={o.id}>
            <Row>
              <T bold style={{ flex: 1 }}>{o.title}</T>
              {o.used ? <Tag label="Used" tone="neutral" /> : expired ? <Tag label="Expired" tone="neutral" />
                : left !== null && o.valid_to! <= addDays(today, 7) ? <Tag label={left === 0 ? 'Ends today' : `${left}d left`} tone="bad" /> : null}
            </Row>
            <T sub>{card?.name ?? 'Any card'}{o.merchant ? ` · ${o.merchant}` : ''}{o.valid_to ? ` · until ${pretty(o.valid_to)}` : ''}{o.source === 'monitor' ? ' · auto-found' : ''}</T>
            {o.how_to_use ? <T size={13}>{o.how_to_use}</T> : null}
            <Row>
              <Button small kind="danger" title="Delete" onPress={() => deleteOffer(o.id)} />
              <Toggle label="Used" value={!!o.used} onChange={(v) => setOfferUsed(o.id, v)} />
            </Row>
          </Panel>
        );
      })}
    </Screen>
  );
}
