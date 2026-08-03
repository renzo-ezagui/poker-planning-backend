import sanitizeHtml from 'sanitize-html';

export function sanitizeText(input: string, maxLength: number): string {
  const stripped = sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} });
  return stripped.trim().slice(0, maxLength);
}
