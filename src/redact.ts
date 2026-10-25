import { createHash } from 'node:crypto';

/*
 * GhostBug redaction core. Generated specs embed a copy of this file (see generator.ts) so they
 * fingerprint requests exactly like the recorder: keep it self-contained, node:crypto is the only import.
 */

/** Conservative best-effort redaction. It is NOT a guarantee of anonymization. */
export const REDACTED = '[REDACTED]';
// Matched anywhere in a key: distinctive enough to rarely occur inside unrelated words.
const SECRET_KEY = /password|passwd|secret|token|api[_-]?key|authorization|oauth|cookie|session|csrf|access[_-]?key|private[_-]?key|credential|email|phone|address|card[_-]?(?:num|no|holder)|credit[_-]?card|iban|birth|surname|(?:first|last|full|middle|user|display|given|family|nick|real|maiden)[_-]?name|user[_-]?id/i;
// Short words that also occur inside unrelated keys (author, __typename, discarded, className):
// matched only as a whole camelCase, snake_case or kebab-case segment.
const SECRET_WORDS = new Set(['auth', 'name', 'names', 'card', 'cards', 'private', 'ssn']);
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const LONG_SECRET = /\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,})\b/g;
// Maximal runs of digits separated by spaces or dashes; card numbers are searched inside each run.
const DIGIT_RUN = /\b\d(?:[ -]*\d)*\b/g;

function keyWords(key: string): string[] {
  return key.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/);
}

export function isSensitiveField(key: string): boolean {
  return SECRET_KEY.test(key) || keyWords(key).some(word => SECRET_WORDS.has(word));
}

function passesLuhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit;
  }
  return sum % 10 === 0;
}

/** Real card numbers pass the Luhn check; timestamps and numeric IDs usually do not. */
function containsCardNumber(run: string): boolean {
  // Try every sequence of consecutive digit groups, so a card next to a date or CVV is still caught.
  const groups = run.split(/[ -]+/).filter(Boolean);
  for (let start = 0; start < groups.length; start++) {
    let digits = '';
    for (let end = start; end < groups.length && digits.length <= 19; end++) {
      digits += groups[end];
      if (digits.length >= 13 && digits.length <= 19 && passesLuhn(digits)) return true;
    }
  }
  return false;
}

export function scrubString(input: string): string {
  return input
    .replace(EMAIL, REDACTED)
    .replace(BEARER, REDACTED)
    .replace(LONG_SECRET, REDACTED)
    .replace(DIGIT_RUN, run => containsCardNumber(run) ? REDACTED : run);
}

export function scrubValue(value: unknown, key = '', depth = 0): unknown {
  // Booleans and null reveal nothing secret but drive UI logic: a truthy "[REDACTED]" would change the replay.
  if (typeof value === 'boolean' || value === null) return value;
  if (isSensitiveField(key)) return REDACTED;
  if (depth > 16) return REDACTED;
  if (typeof value === 'string') return scrubString(value);
  if (typeof value === 'number') return value;
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => scrubValue(v, '', depth + 1));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).slice(0, 200).map(([k, v]) => [k, scrubValue(v, k, depth + 1)]));
  }
  return REDACTED;
}

function redactedParams(input: string): string {
  return Array.from(new URLSearchParams(input), ([key, value]) => JSON.stringify([key, isSensitiveField(key) ? REDACTED : scrubString(value)])).sort().join('&');
}

/**
 * Short fingerprint of a request's query string and body, hashed AFTER redaction: it reveals no more
 * than saving the redacted request would. Undefined for bodies that cannot be redacted field by field
 * (raw text, multipart, binary); such requests fall back to recorded order on replay.
 */
export function fingerprintRequest(search: string, body: string | null, contentType = ''): string | undefined {
  const parts = ['query ' + redactedParams(search)];
  if (body) {
    let json: unknown;
    try { json = JSON.parse(body); } catch { /* not JSON */ }
    if (typeof json === 'object' && json !== null) parts.push('json ' + JSON.stringify(scrubValue(json)));
    else if (contentType.includes('x-www-form-urlencoded')) parts.push('form ' + redactedParams(body));
    else return undefined;
  }
  return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 16);
}
