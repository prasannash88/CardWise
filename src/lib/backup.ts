// Backup to a JSON file you can save to Google Drive via the Android share sheet,
// and restore from one. Secrets (API key) are not included.

import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { dumpAll, restoreAll } from '../db/db';
import { todayISO } from './dates';

const FORMAT = 'cardwise-backup';

export async function exportBackup(): Promise<string> {
  const data = await dumpAll();
  const payload = { format: FORMAT, version: 1, exported_at: new Date().toISOString(), data };
  const file = new File(Paths.cache, `cardwise-backup-${todayISO()}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(payload, null, 2));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save CardWise backup' });
  }
  return file.uri;
}

export async function pickJsonFile(): Promise<unknown | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.length) return null;
  const text = await new File(res.assets[0].uri).text();
  return JSON.parse(text);
}

export async function importBackup(): Promise<boolean> {
  const parsed = (await pickJsonFile()) as { format?: string; data?: Record<string, Record<string, unknown>[]> } | null;
  if (!parsed) return false;
  if (parsed.format !== FORMAT || !parsed.data) throw new Error('That file is not a CardWise backup.');
  await restoreAll(parsed.data);
  return true;
}
