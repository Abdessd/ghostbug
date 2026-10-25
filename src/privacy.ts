/** Conservative best-effort redaction. It is NOT a guarantee of anonymization. */
export const REDACTED = '[REDACTED]';
const SECRET_KEY = /password|passwd|secret|token|api[_-]?key|authorization|auth|cookie|session|csrf|client[_-]?secret|access[_-]?key|private|credential|email|phone|address|card|iban|ssn|birth|name|first[_-]?name|last[_-]?name|user[_-]?id/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const LONG_SECRET = /\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,})\b/g;
const PAYMENT_CARD = /\b(?:\d[ -]*?){13,19}\b/g;

export function isSensitiveField(key: string): boolean {
  return SECRET_KEY.test(key);
}

export function scrubString(input: string): string {
  return input
    .replace(EMAIL, REDACTED)
    .replace(BEARER, REDACTED)
    .replace(LONG_SECRET, REDACTED)
    .replace(PAYMENT_CARD, REDACTED);
}

export function scrubValue(value: unknown, key = '', depth = 0): unknown {
  if (isSensitiveField(key)) return REDACTED;
  if (depth > 16) return REDACTED;
  if (typeof value === 'string') return scrubString(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => scrubValue(v, '', depth + 1));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).slice(0, 200).map(([k, v]) => [k, scrubValue(v, k, depth + 1)]));
  }
  return REDACTED;
}

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
