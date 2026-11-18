import { requireOptionalNativeModule, type EventSubscription } from 'expo';

export interface MailPdf {
  id: string; // Message-ID
  from: string;
  subject: string;
  date: number; // ms
  fileUri: string | null; // null when the email had no PDF attached
  filename: string | null;
}

export interface SharedPdf {
  fileUri: string;
  filename: string;
}

interface StatementInboxNative {
  fetchPdfs(email: string, appPassword: string, sinceMs: number, senders: string[], subjectWord: string, skipIds: string[], maxMessages: number): Promise<MailPdf[]>;
  testLogin(email: string, appPassword: string): Promise<boolean>;
  takeSharedPdf(): SharedPdf | null;
  addListener(event: 'onSharedPdf', listener: (p: SharedPdf) => void): EventSubscription;
}

// Null in Expo Go: needs the installed CardWise APK.
const native = requireOptionalNativeModule<StatementInboxNative>('StatementInbox');

export function isInboxAvailable(): boolean {
  return native != null;
}

export class MailAuthError extends Error {}

function wrap<T>(p: Promise<T>): Promise<T> {
  return p.catch((e) => {
    if ((e as { code?: string }).code === 'ERR_MAIL_AUTH') {
      throw new MailAuthError('Gmail rejected the address or app password. Check both in Settings → Email statements.');
    }
    throw e;
  });
}

export function fetchMailPdfs(email: string, appPassword: string, sinceMs: number, senders: string[], skipIds: string[], maxMessages = 30) {
  if (!native) return Promise.reject(new Error('Email import needs the installed CardWise APK.'));
  return wrap(native.fetchPdfs(email, appPassword, sinceMs, senders, 'statement', skipIds, maxMessages));
}

export function testMailLogin(email: string, appPassword: string) {
  if (!native) return Promise.reject(new Error('Email import needs the installed CardWise APK.'));
  return wrap(native.testLogin(email, appPassword));
}

export function takeSharedPdf(): SharedPdf | null {
  return native?.takeSharedPdf() ?? null;
}

export function onSharedPdf(listener: (p: SharedPdf) => void): () => void {
  if (!native) return () => {};
  const sub = native.addListener('onSharedPdf', listener);
  return () => sub.remove();
}
