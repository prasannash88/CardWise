import '../lib/background';

import * as LocalAuthentication from 'expo-local-authentication';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Button, H1, T, useTheme } from '../components/ui';
import { getDb, getSetting } from '../db/db';
import { registerBackgroundTask } from '../lib/background';
import { ensurePermission, refreshNotifications } from '../lib/notifications';
import { setRules, validateRules } from '../lib/rules';
import { fetchUpdates } from '../lib/updates';

const RELOCK_AFTER_MS = 60_000;

/** Shows render errors on screen instead of closing the app. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 64, gap: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: '700' }}>Something went wrong</Text>
      <Text selectable>{error.message}</Text>
      <Text selectable style={{ fontSize: 11, color: '#6B7280' }}>{error.stack?.slice(0, 2000)}</Text>
      <Button title="Try again" onPress={retry} />
    </ScrollView>
  );
}

export default function RootLayout() {
  const t = useTheme();
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const lockEnabled = useRef(false);
  const backgroundedAt = useRef<number | null>(null);

  const unlock = useCallback(async () => {
    const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock CardWise' });
    if (res.success) setLocked(false);
  }, []);

  useEffect(() => {
    (async () => {
      await getDb();
      const override = await getSetting<unknown>('rules_override', null);
      if (override && validateRules(override)) setRules(override);
      lockEnabled.current = await getSetting<boolean>('lock_enabled', false);
      if (lockEnabled.current) setLocked(true);
      setReady(true);
      if (lockEnabled.current) unlock();
      await ensurePermission().catch(() => false);
      await refreshNotifications();
      await registerBackgroundTask();
      fetchUpdates(true).catch(() => undefined);
    })();
  }, [unlock]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (s) => {
      if (s === 'background') backgroundedAt.current = Date.now();
      if (s === 'active') {
        lockEnabled.current = await getSetting<boolean>('lock_enabled', false);
        const away = backgroundedAt.current ? Date.now() - backgroundedAt.current : 0;
        if (lockEnabled.current && away > RELOCK_AFTER_MS) {
          setLocked(true);
          unlock();
        }
      }
    });
    return () => sub.remove();
  }, [unlock]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: t.bg }} />;

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {locked ? (
        <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
          <H1>CardWise is locked</H1>
          <T sub>Use your fingerprint to continue.</T>
          <Button title="Unlock" onPress={unlock} />
        </View>
      ) : (
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: t.panel },
            headerTintColor: t.text,
            contentStyle: { backgroundColor: t.bg },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="card/[id]" options={{ title: 'Card' }} />
          <Stack.Screen name="card/edit" options={{ title: 'Card', presentation: 'modal' }} />
          <Stack.Screen name="txn/edit" options={{ title: 'Spend', presentation: 'modal' }} />
          <Stack.Screen name="statement" options={{ title: 'Statement' }} />
          <Stack.Screen name="sms" options={{ title: 'Spends from SMS' }} />
          <Stack.Screen name="offers" options={{ title: 'Offers' }} />
          <Stack.Screen name="updates" options={{ title: 'Updates' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        </Stack>
      )}
    </SafeAreaProvider>
  );
}
