import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Button, Field, H2, KV, Panel, Screen, Select, T, Toggle } from '../components/ui';
import { getSetting, setSetting, syncAllCardRules } from '../db/db';
import { exportBackup, importBackup, pickJsonFile } from '../lib/backup';
import { getApiKey, setApiKey } from '../lib/claude';
import { isValidISO } from '../lib/dates';
import { DEFAULT_PREFS, ensurePermission, refreshNotifications, type NotifPrefs } from '../lib/notifications';
import { getBundledRules, getRules, setRules, validateRules } from '../lib/rules';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Settings() {
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  const [time, setTime] = useState('09:00');
  const [lock, setLock] = useState(false);
  const [key, setKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [feed, setFeed] = useState('');
  const [holidays, setHolidays] = useState('');
  const [rulesVersion, setRulesVersion] = useState(getRules().version);

  useEffect(() => {
    (async () => {
      const p = await getSetting<NotifPrefs>('notif_prefs', DEFAULT_PREFS);
      setPrefs(p);
      setTime(`${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`);
      setLock(await getSetting('lock_enabled', false));
      setHasKey(!!(await getApiKey()));
      setFeed(await getSetting('updates_url', ''));
      setHolidays((await getSetting<string[]>('holidays', [])).join(', '));
    })();
  }, []);

  const saveNotif = async (next: NotifPrefs) => {
    setPrefs(next);
    await setSetting('notif_prefs', next);
    if (next.enabled) await ensurePermission();
    await refreshNotifications();
  };

  const saveTime = () => {
    const m = time.match(/^(\d{1,2}):(\d{2})$/);
    if (!m || +m[1] > 23 || +m[2] > 59) return Alert.alert('Time', 'Use 24-hour HH:MM, e.g. 09:00');
    saveNotif({ ...prefs, hour: +m[1], minute: +m[2] });
  };

  const toggleLock = async (v: boolean) => {
    if (v) {
      if (!(await LocalAuthentication.hasHardwareAsync()) || !(await LocalAuthentication.isEnrolledAsync())) {
        return Alert.alert('No fingerprint set up', 'Add a fingerprint or screen lock in Android settings first.');
      }
      const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Confirm to turn on app lock' });
      if (!res.success) return;
    }
    setLock(v);
    await setSetting('lock_enabled', v);
  };

  const saveKey = async () => {
    await setApiKey(key);
    setHasKey(!!key.trim());
    setKey('');
    Alert.alert('Saved', key.trim() ? 'API key stored in secure storage.' : 'API key removed.');
  };

  const saveHolidays = async () => {
    const list = holidays.split(/[,\s]+/).filter(Boolean);
    const bad = list.filter((d) => !isValidISO(d));
    if (bad.length) return Alert.alert('Dates', `Not valid: ${bad.join(', ')}`);
    await setSetting('holidays', list);
    await refreshNotifications();
    Alert.alert('Saved', `${list.length} holiday(s).`);
  };

  const importRules = async () => {
    try {
      const r = await pickJsonFile();
      if (!r) return;
      if (!validateRules(r)) return Alert.alert('Not a rules file', 'Needs version, categories and cards.');
      setRules(r);
      await setSetting('rules_override', r);
      await syncAllCardRules();
      setRulesVersion(r.version);
      Alert.alert('Rules updated', `Now using rules version ${r.version}.`);
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
    }
  };

  const resetRules = async () => {
    setRules(getBundledRules());
    await setSetting('rules_override', null);
    await syncAllCardRules();
    setRulesVersion(getBundledRules().version);
  };

  return (
    <Screen>
      <H2>Notifications</H2>
      <Panel>
        <Toggle label="Reminders" value={prefs.enabled} onChange={(v) => saveNotif({ ...prefs, enabled: v })}
          hint="5 days and 1 day before each due date, statement day, offer expiry, spend gates close to target, weekly summary." />
        <Field label="Reminder time (24h)" value={time} onChangeText={setTime} onBlur={saveTime} keyboardType="numbers-and-punctuation" />
        <Select label="Weekly summary day" value={prefs.weeklyDay} onChange={(d) => saveNotif({ ...prefs, weeklyDay: d })}
          options={DAYS.map((d, i) => ({ label: d, value: i + 1 }))} />
        <Button small kind="secondary" title="Send a test notification" onPress={async () => {
          await ensurePermission();
          await Notifications.scheduleNotificationAsync({ content: { title: 'CardWise', body: 'Notifications are working.' }, trigger: null });
        }} />
      </Panel>

      <H2>Bank holidays</H2>
      <Panel>
        <Field label="Dates (YYYY-MM-DD, comma separated)" value={holidays} onChangeText={setHolidays} multiline
          hint="Due dates on these days (or weekends) get a reminder a day earlier." />
        <Button small kind="secondary" title="Save holidays" onPress={saveHolidays} />
      </Panel>

      <H2>Security</H2>
      <Panel>
        <Toggle label="Lock with fingerprint" value={lock} onChange={toggleLock} hint="Asks on launch and after a minute in the background." />
        <T sub size={12}>CardWise stores only card names and last 4 digits. Never enter full numbers, CVV, expiry, PIN or OTP.</T>
      </Panel>

      <H2>Claude API (statement reading)</H2>
      <Panel>
        <KV k="API key" v={hasKey ? 'Saved in secure storage' : 'Not set'} tone={hasKey ? 'good' : 'warn'} />
        <Field label={hasKey ? 'Replace key (leave empty and save to remove)' : 'Paste your API key'} value={key} onChangeText={setKey}
          secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="sk-ant-…" />
        <Button small kind="secondary" title="Save key" onPress={saveKey} />
      </Panel>

      <H2>Backup</H2>
      <Panel>
        <T sub>Saves everything (except your API key) to a JSON file. Choose Google Drive in the share sheet.</T>
        <Button title="Back up now" onPress={() => exportBackup().catch((e) => Alert.alert('Backup failed', String(e)))} />
        <Button title="Restore from file" kind="secondary" onPress={() => Alert.alert('Restore?', 'This replaces all data on this phone with the backup.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Restore', style: 'destructive', onPress: async () => {
            try {
              if (await importBackup()) { await refreshNotifications(); Alert.alert('Restored'); }
            } catch (e) { Alert.alert('Restore failed', e instanceof Error ? e.message : String(e)); }
          } },
        ])} />
      </Panel>

      <H2>Rules file</H2>
      <Panel>
        <KV k="Version in use" v={rulesVersion} />
        <T sub size={12}>{getRules().notes}</T>
        <Button small kind="secondary" title="Import rules.json" onPress={importRules} />
        <Button small kind="secondary" title="Reset to built-in rules" onPress={resetRules} />
      </Panel>

      <H2>Updates feed (Phase 4)</H2>
      <Panel>
        <Field label="updates.json URL" value={feed} onChangeText={setFeed} autoCapitalize="none" autoCorrect={false}
          placeholder="https://raw.githubusercontent.com/<you>/<repo>/main/monitor/updates.json" />
        <Button small kind="secondary" title="Save URL" onPress={async () => { await setSetting('updates_url', feed.trim()); Alert.alert('Saved'); }} />
      </Panel>
    </Screen>
  );
}
