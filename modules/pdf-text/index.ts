import { requireOptionalNativeModule } from 'expo';

interface PdfTextNative {
  extractText(uri: string, password: string): Promise<{ text: string; pages: number }>;
}

// Null in Expo Go: needs the installed CardWise APK.
const native = requireOptionalNativeModule<PdfTextNative>('PdfText');

export function isPdfTextAvailable(): boolean {
  return native != null;
}

export class PdfPasswordError extends Error {}

/** Text of a PDF, unlocking it with `password` when it is protected. */
export async function extractPdfText(uri: string, password = ''): Promise<{ text: string; pages: number }> {
  if (!native) throw new Error('Reading PDFs on the phone needs the installed CardWise APK.');
  try {
    return await native.extractText(uri, password);
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_PDF_PASSWORD') {
      throw new PdfPasswordError(password ? 'That password did not open the PDF.' : 'This PDF needs a password.');
    }
    throw e;
  }
}
