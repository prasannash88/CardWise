// Hidden diagnostics page (cardwise://selftest). The emulator CI job opens it and reads the
// CARDWISE_SELFTEST lines from logcat to check native modules and the Claude API path.

import { File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { Screen, T } from '../components/ui';
import { extractPdfText, isPdfTextAvailable, PdfPasswordError } from '../../modules/pdf-text';
import { isSmsReadingAvailable, readInbox } from '../../modules/sms-reader';
import { isInboxAvailable, MailAuthError, testMailLogin } from '../../modules/statement-inbox';
import { getDb } from '../db/db';
import { extractStatementFromText, friendlyError } from '../lib/claude';

// A tiny AES-encrypted PDF (password "test123") containing the word SELFTEST.
const LOCKED_PDF = 'JVBERi0xLjMKJeLjz9MKMSAwIG9iago8PAovUGFnZU1vZGUgL1VzZU5vbmUKL1BhZ2VzIDIgMCBSCi9UeXBlIC9DYXRhbG9nCj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9Db3VudCAxCi9LaWRzIFsgMyAwIFIgXQovVHlwZSAvUGFnZXMKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL0NvbnRlbnRzIDQgMCBSCi9NZWRpYUJveCBbIDAgMCA1OTUuMjc1NiA4NDEuODg5OCBdCi9QYXJlbnQgMiAwIFIKL1Jlc291cmNlcyA8PAovRm9udCA1IDAgUgovUHJvY1NldCBbIC9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUkgXQo+PgovUm90YXRlIDAKL1RyYW5zIDw8Cj4+Ci9UeXBlIC9QYWdlCj4+CmVuZG9iago0IDAgb2JqCjw8Ci9GaWx0ZXIgWyAvQVNDSUk4NURlY29kZSAvRmxhdGVEZWNvZGUgXQovTGVuZ3RoIDE2MAo+PgpzdHJlYW0KRRpvG3Ow668Q3gXfw+OSNk3s113yXdchQJgCefMSOTAbi6PjcLT6HMnbdGZOJDFBwd8dFLv2t5KxqLrzSp6NyuqW8MsEKZXAUwutUd2b8Q7r3yEBZsG+pbEPs/nYSPTaDTUkA3kiRs+JJQ3+2sqSx0WvzQpl+hTV58I/3/ElVascN6MxWJER5E7fJKWKUiFpdh/4k65r7Hkd9Aj/+YEW1AplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmoKPDwKL0YxIDYgMCBSCj4+CmVuZG9iago2IDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhCi9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nCi9OYW1lIC9GMQovU3VidHlwZSAvVHlwZTEKL1R5cGUgL0ZvbnQKPj4KZW5kb2JqCjcgMCBvYmoKPDwKL0F1dGhvciA8OTQ2OWU1Nzc3NzdlNjUwNzJjOGRhYTg1MDU1MTA3MmFjZmRjN2Q4ODFiZThiZDY5NTgxNTE2NGNmMTQwZDQ0Nz4KL0NyZWF0aW9uRGF0ZSA8YjNmMjkxNzQ1OGVjYWZhZTJiODhhOTdlNDUwYTZlNWNjOTgxOGUwNTEzMTcyYTZjYTVjYzM4NmFmYzE4NDNjY2IzOTAwMzgyNTA4YWIxZTkwYWFmYjA1ZWU2ODVjMDBkPgovQ3JlYXRvciA8NDE2MTI4MzNjYjk2ODU4YWRhMTYzODhkZjlhZjM1MjJiYzA1ZWYyNDhiYzNjZWQ0N2IzNGY3OTE3ZWMyYWJmOD4KL0tleXdvcmRzIDwxMjk5NDU4MjQ3NmJjOGQxNjZhNThkN2U5YjZhZDA0ZjZlODE1MTYxZTdhNTMyNmU3NWQxODNmZTdhMTU0MmM2PgovTW9kRGF0ZSA8M2NlMjIzODU1MTg0ZjczNTYyN2EyODAzZGRiZWQxMDM0ZmQ5N2JjZWZlNTIwNDExNmE0NTI2MzE4NzhjNGIxMDQyNzkzOGU2ZjA1YWNlYjMwNWQ1ODUwNGYxYTU0MmUxPgovUHJvZHVjZXIgPDc5MzA3MTYzMTRhZTU1MzQ5NjM4Y2FmZGYyMzE1ZmQwYmE0YjYwMmE2ZTllOTQwNmM3ZmNkNmQ5NzE4YzEzMmRhZjEwNzZmOWQwOWQ1MDA1OThlM2VmODFhN2VjNDAxMzA5ZTdlMTA2MmJiNzNlMDc0ODdhMTY5NDEzMDVmNWQyPgovU3ViamVjdCA8MDM0MWRkZjJhNmQwZDczMjY4NTE3OWMzYWJkMmNlOTNjYmUwZjZkNzJkNGMzOGYxNGUyZDdmYTg2MjkwMjRhZj4KL1RpdGxlIDwxM2Q3OGUyNDdiMmYzZDFkNDJmZjRmNDM3NGUxNTE3MjJiYzg0MDVhY2QwYjk4OWViMmQxOTdlYTc4M2ExOTM5PgovVHJhcHBlZCAvRmFsc2UKPj4KZW5kb2JqCjggMCBvYmoKPDwKL1YgNAovUiA0Ci9MZW5ndGggMTI4Ci9QIDQyOTQ5NjcyOTIKL0ZpbHRlciAvU3RhbmRhcmQKL08gPDAzYTU5ZDEwYWFlM2I1MGYxYTMwYzM0ZmJiMWJlMDlhYmFiZmMxZmIxOWYwZDM0OTFlZTg0YzE3NTI2NzE5MTg+Ci9VIDxjOTVmYTBjOTE4MmZlMWYzNjhhNDNjNDRmMDAxM2Y2ODI4YmY0ZTVlNGU3NThhNDE2NDAwNGU1NmZmZmEwMTA4PgovQ0YgPDwKL1N0ZENGIDw8Ci9BdXRoRXZlbnQgL0RvY09wZW4KL0NGTSAvQUVTVjIKL0xlbmd0aCAxNgo+Pgo+PgovU3RtRiAvU3RkQ0YKL1N0ckYgL1N0ZENGCj4+CmVuZG9iagp4cmVmCjAgOQowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTUgMDAwMDAgbiAKMDAwMDAwMDA4MyAwMDAwMCBuIAowMDAwMDAwMTQyIDAwMDAwIG4gCjAwMDAwMDAzNDEgMDAwMDAgbiAKMDAwMDAwMDU5MiAwMDAwMCBuIAowMDAwMDAwNjIzIDAwMDAwIG4gCjAwMDAwMDA3MzAgMDAwMDAgbiAKMDAwMDAwMTUwNyAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9TaXplIDkKL1Jvb3QgMSAwIFIKL0luZm8gNyAwIFIKL0lEIFsgPDkxODBiZjczMWE3ODEyZDQ4MTZjMThmMmFiOWQ1ODM3PiA8ZTlkMmFkMDBmNzIzMzkyNjU4MjM1MzMzYTFkNDBlOGU+IF0KL0VuY3J5cHQgOCAwIFIKPj4Kc3RhcnR4cmVmCjE4MTQKJSVFT0YK';

type Result = { name: string; ok: boolean; detail: string };

async function check(name: string, fn: () => Promise<string>): Promise<Result> {
  try {
    return { name, ok: true, detail: await fn() };
  } catch (e) {
    return { name, ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

async function runAll(): Promise<Result[]> {
  const file = new File(Paths.cache, 'selftest-locked.pdf');
  if (file.exists) file.delete();
  file.create();
  await file.write(Uint8Array.from(atob(LOCKED_PDF), (c) => c.charCodeAt(0)));
  return [
    await check('sqlite', async () => {
      const db = await getDb();
      const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM cards');
      return `cards=${r?.n}`;
    }),
    await check('pdf-module', async () => {
      if (!isPdfTextAvailable()) throw new Error('PdfText native module missing');
      return 'loaded';
    }),
    await check('pdf-unlock', async () => {
      const { text, pages } = await extractPdfText(file.uri, 'test123');
      if (!text.includes('SELFTEST')) throw new Error(`unexpected text: ${text.slice(0, 80)}`);
      return `pages=${pages}`;
    }),
    await check('pdf-wrong-password', async () => {
      try {
        await extractPdfText(file.uri, 'wrong');
      } catch (e) {
        if (e instanceof PdfPasswordError) return 'rejected as expected';
        throw e;
      }
      throw new Error('opened with a wrong password');
    }),
    await check('sms-module', async () => {
      if (!isSmsReadingAvailable()) throw new Error('SmsReader native module missing');
      const msgs = await readInbox(0, 5);
      return `read ${msgs.length} message(s)`;
    }),
    await check('mail-imap', async () => {
      if (!isInboxAvailable()) throw new Error('StatementInbox native module missing');
      try {
        await testMailLogin('cardwise.selftest@gmail.com', 'aaaabbbbccccdddd');
      } catch (e) {
        if (e instanceof MailAuthError) return 'reached Gmail IMAP (dummy login rejected as expected)';
        throw e;
      }
      throw new Error('dummy login accepted?');
    }),
    await check('claude-api', async () => {
      try {
        await extractStatementFromText('test', 'Self-test card', 'sk-ant-api03-selftest-invalid-key');
      } catch (e) {
        const msg = friendlyError(e);
        if (msg.includes('API key was rejected')) return 'SDK reached the API (dummy key rejected as expected)';
        throw new Error(msg);
      }
      throw new Error('dummy key was accepted?');
    }),
  ];
}

export default function SelfTest() {
  const [results, setResults] = useState<Result[] | null>(null);
  useEffect(() => {
    runAll().then((r) => {
      setResults(r);
      for (const x of r) console.log(`CARDWISE_SELFTEST ${x.ok ? 'PASS' : 'FAIL'} ${x.name}: ${x.detail}`);
      console.log(`CARDWISE_SELFTEST DONE ${r.every((x) => x.ok) ? 'ALL_PASS' : 'SOME_FAILED'}`);
    });
  }, []);
  return (
    <Screen>
      {!results ? <T sub>Running…</T> : results.map((r) => (
        <T key={r.name} tone={r.ok ? 'good' : 'bad'}>{r.ok ? '✓' : '✗'} {r.name}: {r.detail}</T>
      ))}
    </Screen>
  );
}
