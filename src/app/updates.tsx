import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable } from 'react-native';
import { Button, Empty, Panel, Row, Screen, T, Tag } from '../components/ui';
import { getSetting, listCards, listSnapshots, markSnapshotsSeen } from '../db/db';
import { pretty } from '../lib/dates';
import { ruleById } from '../lib/rules';
import { checkTerms } from '../lib/tncMonitor';
import { useLive } from '../lib/useLive';

export default function Updates() {
  const { data } = useLive(async () => ({
    snaps: await listSnapshots(), cards: await listCards(),
    last: await getSetting<number | null>('tnc_last_check', null),
  }));
  const [busy, setBusy] = useState(false);

  // Mark as seen when leaving the screen with them visible.
  useEffect(() => () => { markSnapshotsSeen(); }, []);

  const refresh = async () => {
    setBusy(true);
    try {
      const r = await checkTerms(false);
      const lines = [
        `Checked: ${r.checked.length} page(s).`,
        r.baseline.length ? `First look (saved for comparison next time): ${r.baseline.join(', ')}.` : '',
        r.changed.length ? `Changed: ${r.changed.join(', ')}.` : 'No changes that matter.',
        r.failed.length ? `Could not check: ${r.failed.map((f) => `${f.name} (${f.error})`).join('; ')}.` : '',
      ].filter(Boolean);
      Alert.alert('Bank pages checked', lines.join('\n\n'));
    } catch (e) {
      Alert.alert('Could not check', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <Screen><T sub>Loading…</T></Screen>;

  return (
    <Screen>
      <Panel>
        <T sub>
          Once a week CardWise reads each card's official benefits page. If the text changes, Claude summarises what
          changed for you and you get a notification.
        </T>
        <Row>
          <T sub>Last checked {data.last ? new Date(data.last).toLocaleString() : 'never'}</T>
          <Button small kind="secondary" title={busy ? 'Checking…' : 'Check now'} onPress={refresh} disabled={busy} />
        </Row>
      </Panel>
      {data.snaps.length === 0 ? <Empty title="No changes detected yet" /> : data.snaps.map((s) => {
        const rule = ruleById(s.rule_id);
        const card = data.cards.find((c) => c.id === s.card_id);
        return (
          <Panel key={s.id}>
            <Row>
              <T bold>{card?.name ?? rule?.name ?? s.rule_id ?? 'Card'}</T>
              {!s.seen ? <Tag label="New" tone="warn" /> : null}
            </Row>
            <T sub>{pretty(s.fetched_on)}</T>
            <T>{s.ai_summary_of_change}</T>
            {s.what_it_means ? <T tone="accent">What it means for you: {s.what_it_means}</T> : null}
            <Pressable onPress={() => Linking.openURL(s.url)}><T sub size={12} tone="accent">{s.url}</T></Pressable>
          </Panel>
        );
      })}
      <T sub size={12}>When a change is confirmed, update rules.json (Settings → Rules file) so the app's maths follows the new rules.</T>
    </Screen>
  );
}
