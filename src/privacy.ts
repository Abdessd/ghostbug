/** Conservative best-effort redaction. It is NOT a guarantee of anonymization. */
import { REDACTED, scrubString, scrubValue } from './redact.ts';

export { REDACTED, fingerprintRequest, isSensitiveField, scrubString, scrubValue } from './redact.ts';

/** Never save query strings or hash fragments, which often contain credentials. */
export function safeUrl(input: string): string {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol)) throw Error('Recording supports only HTTP/HTTPS URLs');
  if (url.username || url.password) throw Error('URLs containing credentials are not allowed');
  return `${url.origin}${url.pathname}`;
}

/** Deliberately exclude freeform input values unless separately reviewed. */
export function scrubInput(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  return REDACTED;
}

export function scrubResponseBody(body: string, contentType: string): string {
  if (contentType.includes('json')) {
    try { return JSON.stringify(scrubValue(JSON.parse(body))); }
    catch { return scrubString(body); }
  }
  return scrubString(body);
}
