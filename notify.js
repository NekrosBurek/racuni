// Phone notifications, also when the app is closed:
// - a background task (Android WorkManager, every few hours) checks GitHub for a new version and posts one
//   notification per version;
// - warranty reminders are scheduled with the system 30 and 7 days before a warranty ends, refreshed whenever the
//   receipts load.
// Imported from index.js, so the task is defined before Android starts the app headless to run it.
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { findUpdate } from './version';
import { warrantyReminders } from './plans';
import { itemsSummary } from './stats';

const CHANNEL = 'racuni';
const UPDATE_TASK = 'racuni-update-check';
const NOTIFIED_VERSION = 'notified-version';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

TaskManager.defineTask(UPDATE_TASK, async () => {
  try {
    const update = await findUpdate();
    if (update && (await SecureStore.getItemAsync(NOTIFIED_VERSION)) !== update.latest) {
      await Notifications.scheduleNotificationAsync({
        content: { title: 'Nova verzija Računa', body: `Verzija ${update.latest} je spremna. Dodirni da je instaliraš.`, data: { type: 'update' } },
        trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
      });
      await SecureStore.setItemAsync(NOTIFIED_VERSION, update.latest);
    }
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

// Asks for the notification permission (Android 13+) and starts the background update check; safe to call often.
export async function setupNotifications() {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Računi', importance: Notifications.AndroidImportance.DEFAULT });
    }
    const { granted } = await Notifications.requestPermissionsAsync();
    if (granted) await BackgroundTask.registerTaskAsync(UPDATE_TASK, { minimumInterval: 6 * 60 });
  } catch {
    // notifications are a convenience; the app works without them
  }
}

// Replaces the scheduled warranty reminders with the ones for these receipts.
export async function scheduleWarrantyReminders(receipts) {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(scheduled.filter(n => n.identifier.startsWith('warranty-'))
      .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier)));
    for (const n of warrantyReminders(receipts, r => itemsSummary(r) || r.shop || r.name)) {
      await Notifications.scheduleNotificationAsync({
        identifier: n.id,
        content: { title: n.title, body: n.body, data: { type: 'warranty' } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.date, channelId: CHANNEL },
      });
    }
  } catch {
    // no permission or scheduling unavailable: the overview still lists the warranties
  }
}

// Calls back when the user taps an update notification.
export const onUpdateNotificationTap = callback =>
  Notifications.addNotificationResponseReceivedListener(r => {
    if (r.notification.request.content.data?.type === 'update') callback();
  });
