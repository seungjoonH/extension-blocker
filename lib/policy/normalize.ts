export type NormalizeExtensionResult =
  | { ok: true; value: string }
  | { ok: false; reason: 'EMPTY' | 'TOO_LONG' | 'INVALID_CHARACTERS' };

const EXTENSION_PATTERN = /^[a-z0-9]+(\.[a-z0-9]+)*$/;

export function normalizeExtensionInput(raw: string): NormalizeExtensionResult {
  let value = raw.trim();

  if (value.startsWith('.')) {
    value = value.slice(1);
  }

  value = value.toLowerCase();

  if (value.length === 0) {
    return { ok: false, reason: 'EMPTY' };
  }

  if (value.length > 20) {
    return { ok: false, reason: 'TOO_LONG' };
  }

  if (!EXTENSION_PATTERN.test(value)) {
    return { ok: false, reason: 'INVALID_CHARACTERS' };
  }

  return { ok: true, value };
}
