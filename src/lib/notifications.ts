// Local notifications: due-date reminders (5 days and 1 day before), statement day,
// offer expiry, a weekly summary, and a nudge when a spend gate is close with <10 days left.

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getSetting, setSetting } from '../db/db';
import { addDays, payByDate, pretty, todayISO } from './dates';
import { loadOverview, type Overview } from './overview';
import { inr } from './rewards';
import { weeklySummary } from './suggest';
import type { ISODate } from './types';

export interface NotifPrefs {
  hour: number;
  minute: number;
  weeklyDay: number; // 1 = Sunday ... 7 = Saturday
  enabled: boolean;
}
export const DEFAULT_PREFS: NotifPrefs = { hour: 9, minute: 0, weeklyDay: 1, enabled: true };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false,
  }),
});

const CHANNEL = 'reminders';

export async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Bills and benefits', importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

function at(date: ISODate, p: NotifPrefs): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, p.hour, p.minute);
}

async function scheduleOn(date: ISODate, p: NotifPrefs, title: string, body: string) {
  const when = at(date, p);
  if (when.getTime() <= Date.now() + 60_000) return;
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: CHANNEL },
  });
}

export async function rescheduleAll(overview?: Overview) {
  const prefs = await getSetting<NotifPrefs>('notif_prefs', DEFAULT_PREFS);
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!prefs.enabled) return;
  const o = overview ?? (await loadOverview());
  const holidays = await getSetting<ISODate[]>('holidays', []);

  for (const s of o.summaries) {
    if (s.card.is_addon) continue;
    const name = s.card.name;
    const bills: { due: ISODate; amount: number | null }[] = [];
    if (!s.bill.paid) bills.push({ due: s.bill.due, amount: s.bill.totalDue });
    bills.push({ due: s.cycle.nextDue, amount: null });
    for (const b of bills) {
      const payBy = payByDate(b.due, holidays);
      const amt = b.amount != null ? ` (${inr(b.amount)})` : '';
      const weekendNote = payBy !== b.due ? ` Due ${pretty(b.due)} falls on a holiday/weekend, so pay by ${pretty(payBy)}.` : '';
      await scheduleOn(addDays(payBy, -5), prefs, `${name} bill due in 5 days`, `Due ${pretty(b.due)}${amt}.${weekendNote}`);
      await scheduleOn(addDays(payBy, -1), prefs, `${name} bill due tomorrow`, `Pay by ${pretty(payBy)}${amt}.`);
    }
    await scheduleOn(s.cycle.nextStatement, prefs, `${name} statement today`,
      `Your new cycle starts tomorrow: purchases from ${pretty(s.cycle.bestDayToBuy)} get ${s.cycle.bestDayInterestFree} interest-free days.`);
  }

  for (const off of o.offers) {
    if (off.used || !off.valid_to) continue;
    await scheduleOn(addDays(off.valid_to, -2), prefs, 'Offer expiring soon', `${off.title} ends ${pretty(off.valid_to)}.`);
  }

  await Notifications.scheduleNotificationAsync({
    content: { title: 'CardWise weekly summary', body: weeklySummary(o) },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: prefs.weeklyDay, hour: prefs.hour,
      minute: prefs.minute, channelId: CHANNEL,
    },
  });
}

/** Fires once per gate window when you're within 20% of the target with under 10 days left. */
export async function checkGateAlerts(overview?: Overview) {
  const prefs = await getSetting<NotifPrefs>('notif_prefs', DEFAULT_PREFS);
  if (!prefs.enabled) return;
  const o = overview ?? (await loadOverview());
  const sent = await getSetting<Record<string, ISODate>>('gate_alerts', {});
  let changed = false;
  for (const s of o.summaries) {
    const g = s.gate;
    if (!g || !g.close || sent[s.card.id] === g.current.start) continue;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${s.card.name}: lounge gate within reach`,
        body: `${inr(g.current.remaining)} more by ${pretty(g.current.end)} (${g.current.daysLeft} days left).`,
      },
      trigger: null,
    });
    sent[s.card.id] = g.current.start;
    changed = true;
  }
  if (changed) await setSetting('gate_alerts', sent);
}

export async function refreshNotifications() {
  try {
    const o = await loadOverview(todayISO());
    await rescheduleAll(o);
    await checkGateAlerts(o);
  } catch (e) {
    console.warn('notification refresh failed', e);
  }
}
