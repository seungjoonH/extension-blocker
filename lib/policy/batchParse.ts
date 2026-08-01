import { normalizeExtensionInput } from './normalize';

export type BatchParseResult = { ok: true; items: string[] } | { ok: false; invalidItems: string[] };

export function splitByComma(raw: string): string[] {
  return raw.split(',');
}

export function splitByLine(raw: string): string[] {
  return raw.split(/\r\n|\n/);
}

// 공통 파이프라인(설계 문서 2절): trim → 빈 값 제거 → 항목별 normalize → 형식 검증 → 입력 내부 중복 제거.
// 이후 단계(기존 커스텀 중복 제외, 고정 확장자 자동 활성화, 200개 제한)는 서버 상태가 필요해
// 이 함수의 책임 밖이다(app/api/policy/custom-extensions/batch/route.ts, Task 4에서 처리).
export function parseBatchItems(rawItems: string[]): BatchParseResult {
  const trimmed = rawItems.map((item) => item.trim()).filter((item) => item.length > 0);

  const invalidItems: string[] = [];
  const validItems: string[] = [];

  for (const raw of trimmed) {
    const result = normalizeExtensionInput(raw);
    if (result.ok) {
      validItems.push(result.value);
    } else {
      invalidItems.push(raw);
    }
  }

  if (invalidItems.length > 0) {
    return { ok: false, invalidItems };
  }

  const seen = new Set<string>();
  const deduped = validItems.filter((item) => {
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  });

  return { ok: true, items: deduped };
}
