export type NormalizeExtensionErrorReason = 'EMPTY' | 'TOO_LONG' | 'CONSECUTIVE_DOTS' | 'INVALID_CHARACTERS';

export type NormalizeExtensionResult = { ok: true; value: string } | { ok: false; reason: NormalizeExtensionErrorReason };

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

  // 연속된 마침표는 REQUIREMENTS.md("연속된 마침표 처리")에 따라 전용 메시지로 안내해야 하므로,
  // 그 외 문자 규칙 위반(INVALID_CHARACTERS)과 별도의 사유로 구분한다.
  if (value.includes('..')) {
    return { ok: false, reason: 'CONSECUTIVE_DOTS' };
  }

  if (!EXTENSION_PATTERN.test(value)) {
    return { ok: false, reason: 'INVALID_CHARACTERS' };
  }

  return { ok: true, value };
}

export function describeExtensionFormatError(reason: NormalizeExtensionErrorReason): string {
  if (reason === 'CONSECUTIVE_DOTS') {
    return '연속된 마침표는 사용할 수 없습니다.';
  }
  return '허용되지 않는 형식의 확장자입니다.';
}
