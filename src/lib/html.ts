// Turns a bank's web page into comparable plain text, and finds which lines changed.

const MAX_TEXT = 60_000;

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/td|\/th)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8377;|&#x20b9;|&#X20B9;/g, 'Rs ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/[ \t\r]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_TEXT);
}

/** Fast non-cryptographic 53-bit hash (cyrb53); enough to tell whether page text changed. */
export function hashText(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/** Lines that appear only in the old or only in the new text (order changes are ignored). */
export function lineDiff(oldText: string, newText: string): { removed: string[]; added: string[] } {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  const sa = new Set(a);
  const sb = new Set(b);
  return { removed: a.filter((l) => !sb.has(l)), added: b.filter((l) => !sa.has(l)) };
}
