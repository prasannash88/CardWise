import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable } from 'react-native';
import { Button, Empty, Panel, Row, Screen, T, Tag } from '../components/ui';
import { getSetting, listCards, listSnapshots, markSnapshotsSeen } from '../db/db';
import { pretty } from '../lib/dates';
import { ruleById } from '../lib/rules';
import { fetchUpdates } from '../lib/updates';
import { useLive } from '../lib/useLive';

export default function Updates() {
  const { data } = useLive(async () => ({
    snaps: await listSnapshots(), cards: await listCards(),
    url: await getSetting<string>('updates_url', ''), last: await getSetting<string | null>('updates_last_fetch', null),
  }));
  const [busy, setBusy] = useState(false);

  // Mark as seen when leaving the screen with them visible.
  useEffect(() => () => { markSnapshotsSeen(); }, []);

  const refresh = async () => {
    setBusy(true);
    try {
      const r = await fetchUpdates(false);
      Alert.alert('Checked', `${r.newChanges} new change(s), ${r.newOffers} new offer(s).`);
    } catch (e) {
      Alert.alert('Could not fetch updates', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <Screen><T sub>Loading…</T></Screen>;

  return (
    <Screen>
      {!data.url ? (
        <Panel>
          <T bold>Monitoring is not connected yet</T>
          <T sub>
            The weekly monitor (monitor/ folder, run by GitHub Actions) watches each card's official page and publishes
            updates.json. Paste its raw URL in Settings → Updates feed.
          </T>
        </Panel>
      ) : (
        <Panel>
          <Row>
            <T sub>Last checked {data.last ? new Date(data.last).toLocaleString() : 'never'}</T>
            <Button small kind="secondary" title={busy ? 'Checking…' : 'Check now'} onPress={refresh} disabled={busy} />
          </Row>
        </Panel>
      )}
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
