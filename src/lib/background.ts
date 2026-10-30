// Daily-ish background work: refresh reminders, check spend gates, pull the updates feed.
// Android decides the exact timing; this must be imported at app start so the task is defined.

import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { refreshNotifications } from './notifications';
import { fetchUpdates } from './updates';

const TASK = 'cardwise-daily';

TaskManager.defineTask(TASK, async () => {
  try {
    await refreshNotifications();
    await fetchUpdates(true).catch(() => undefined);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundTask() {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
    if (!(await TaskManager.isTaskRegisteredAsync(TASK))) {
      await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 12 * 60 });
    }
  } catch (e) {
    console.warn('background task registration failed', e);
  }
}
