import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert } from 'react-native';
import { isInboxAvailable } from '../../modules/statement-inbox';
import { Button, Empty, H2, Panel, Row, Screen, T, Tag, Toggle } from '../components/ui';
import { getSetting, listCards } from '../db/db';
import { checkMail, fileStillThere, getMailAccount, listInbox, setInboxStatus, type InboxItem } from '../lib/mailImport';
import { useLive } from '../lib/useLive';

export default function Inbox() {
  const [busy, setBusy] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const { data } = useLive(async () => ({
    items: await listInbox(), cards: await listCards(), account: await getMailAccount(),
    last: await getSetting<number | null>('mail_last_check', null),
  }));

  const check = async () => {
    setBusy(true);
    try {
      const n = await checkMail();
      Alert.alert('Email checked', n ? `${n} new statement PDF${n === 1 ? '' : 's'} found.` : 'No new statements.');
    } catch (e) {
      Alert.alert('Could not check email', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const open = (it: InboxItem) => {
    if (!it.fileUri) return Alert.alert('No PDF attached', 'This email has no PDF. Your bank may send a download link instead; download it and share the PDF to CardWise.');
    if (!fileStillThere(it.fileUri)) return Alert.alert('File cleared', 'Android cleared the saved copy. Dismiss this item; to re-fetch it, open the email in Gmail and share the PDF to CardWise.');
    router.push({ pathname: '/statement', params: { fileUri: it.fileUri, inboxId: it.id, cardId: it.cardIds[0] ?? '' } });
  };

  if (!data) return <Screen><T sub>Loading…</T></Screen>;
  const configured = !!data.account.email && data.account.hasPassword;
  const items = data.items.filter((i) => (showDone ? true : i.status === 'new'));

  return (
    <Screen>
      {!isInboxAvailable() ? (
        <Panel><T tone="warn">Email import works in the installed CardWise APK, not in Expo Go.</T></Panel>
      ) : !configured ? (
        <Panel>
          <T bold>Connect Gmail first</T>
          <T sub>Settings → Email statements: your Gmail address and an app password. CardWise only reads mail from your cards' banks with "statement" in the subject, and never changes or sends mail.</T>
          <Button title="Open Settings" onPress={() => router.push('/settings')} />
        </Panel>
      ) : (
        <Panel>
          <Row>
            <T sub>{data.account.email} · last checked {data.last ? new Date(data.last).toLocaleString() : 'never'}</T>
          </Row>
          {busy ? <ActivityIndicator /> : <Button title="Check email now" onPress={check} />}
          <T sub size={12}>CardWise also checks by itself every few days and notifies you.</T>
        </Panel>
      )}

      <Panel>
        <T bold>Or share a PDF from Gmail</T>
        <T sub>Open the statement email → tap the PDF → Share (or ⋮ → Share) → CardWise.</T>
      </Panel>

      <Toggle label="Show reviewed and dismissed" value={showDone} onChange={setShowDone} />
      <H2>{items.length} statement email{items.length === 1 ? '' : 's'}</H2>
      {items.length === 0 ? <Empty title="Nothing to review" /> : items.map((it) => {
        const cardNames = it.cardIds.map((id) => data.cards.find((c) => c.id === id)?.name).filter(Boolean).join(' or ');
        return (
          <Panel key={it.id} onPress={() => open(it)}>
            <Row>
              <T bold style={{ flex: 1 }} numberOfLines={2}>{it.subject || '(no subject)'}</T>
              {it.status === 'new' ? <Tag label={it.fileUri ? 'Review' : 'No PDF'} tone={it.fileUri ? 'warn' : 'neutral'} /> : <Tag label={it.status === 'done' ? 'Saved' : 'Dismissed'} tone="neutral" />}
            </Row>
            <T sub numberOfLines={1}>{it.from}</T>
            <T sub>{new Date(it.date).toLocaleDateString()}{cardNames ? ` · ${cardNames}` : ''}{it.filename ? ` · ${it.filename}` : ''}</T>
            {it.status === 'new' ? (
              <Row style={{ justifyContent: 'flex-end' }}>
                <Button small kind="secondary" title="Dismiss" onPress={() => setInboxStatus(it.id, 'dismissed')} />
              </Row>
            ) : null}
          </Panel>
        );
      })}
    </Screen>
  );
}
