import { router } from 'expo-router';
import { Panel, Row, Screen, T, Tag } from '../../components/ui';
import { listCards, listOffers, listSnapshots } from '../../db/db';
import { listInbox } from '../../lib/mailImport';
import { todayISO, addDays } from '../../lib/dates';
import { useLive } from '../../lib/useLive';

export default function More() {
  const { data } = useLive(async () => {
    const [offers, snaps, cards, inbox] = await Promise.all([listOffers(), listSnapshots(), listCards(), listInbox()]);
    const today = todayISO();
    return {
      expiring: offers.filter((o) => !o.used && o.valid_to && o.valid_to >= today && o.valid_to <= addDays(today, 7)).length,
      active: offers.filter((o) => !o.used && (!o.valid_to || o.valid_to >= today)).length,
      unseen: snaps.filter((s) => !s.seen).length,
      toReview: inbox.filter((i) => i.status === 'new' && i.fileUri).length,
      cards,
    };
  });

  const items = [
    { title: 'Offers', sub: data ? `${data.active} active${data.expiring ? `, ${data.expiring} expiring this week` : ''}` : '', href: '/offers', badge: data?.expiring ? 'Expiring' : null },
    { title: 'Updates', sub: 'T&C and benefit changes in plain English', href: '/updates', badge: data?.unseen ? `${data.unseen} new` : null },
    { title: 'Statements from email', sub: 'Gmail statements found automatically, or shared from Gmail', href: '/inbox', badge: data?.toReview ? `${data.toReview} to review` : null },
    { title: 'Upload a statement', sub: 'PDF or pasted text, read by Claude', href: '/statement', badge: null },
    { title: 'Spends from SMS', sub: 'Review bank alerts before saving', href: '/sms', badge: null },
    { title: 'Settings', sub: 'Notifications, backup, app lock, API key, rules file', href: '/settings', badge: null },
  ] as const;

  return (
    <Screen>
      {items.map((it) => (
        <Panel key={it.title} onPress={() => router.push(it.href)}>
          <Row><T bold>{it.title}</T>{it.badge ? <Tag label={it.badge} tone="warn" /> : null}</Row>
          <T sub>{it.sub}</T>
        </Panel>
      ))}
      <T sub size={12}>Your cards ({data?.cards.length ?? 0}): tap one on Home to edit it.</T>
    </Screen>
  );
}
