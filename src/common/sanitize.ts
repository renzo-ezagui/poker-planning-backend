import sanitizeHtml from 'sanitize-html';

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&nbsp;': ' ',
};

/**
 * Strips all markup and returns plain text. sanitize-html re-escapes text
 * (& → &amp;), which clients would then escape a second time and show
 * literally — so decode back to plain characters. Output is never inserted
 * as HTML; every client renders it as text.
 */
export function sanitizeText(input: string, maxLength: number): string {
  const stripped = sanitizeHtml(String(input ?? ''), { allowedTags: [], allowedAttributes: {} });
  const plain = stripped.replace(/&(amp|lt|gt|quot|#39|#x27|nbsp);/g, (m) => ENTITIES[m] ?? m);
  return plain.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}
