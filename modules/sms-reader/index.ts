import { requireOptionalNativeModule } from 'expo';
import { PermissionsAndroid, Platform } from 'react-native';

export interface RawSms {
  id: string;
  address: string | null;
  body: string;
  date: number; // ms since epoch
}

interface SmsReaderNative {
  readInbox(sinceMs: number, limit: number): Promise<RawSms[]>;
}

// Null in Expo Go: SMS reading needs the installed APK (development or release build).
const native = requireOptionalNativeModule<SmsReaderNative>('SmsReader');

export function isSmsReadingAvailable(): boolean {
  return Platform.OS === 'android' && native != null;
}

export async function requestSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
    title: 'Read bank SMS',
    message: 'CardWise reads card spend alerts from your bank to log spends automatically. OTP messages are ignored and nothing leaves your phone.',
    buttonPositive: 'Allow',
  });
  return res === PermissionsAndroid.RESULTS.GRANTED;
}

export async function readInbox(sinceMs: number, limit = 500): Promise<RawSms[]> {
  if (!native) throw new Error('SMS reading needs the installed CardWise APK (it is not available in Expo Go).');
  return native.readInbox(sinceMs, limit);
}
