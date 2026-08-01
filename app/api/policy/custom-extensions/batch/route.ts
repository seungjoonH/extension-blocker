import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server-client';
import { normalizeExtensionInput } from '@/lib/policy/normalize';

export async function POST(request: Request) {
  let body: { items?: unknown };
  try {
    body = (await request.json()) as { items?: unknown };
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_REQUEST_BODY', message: '요청 형식이 올바르지 않습니다.' } },
      { status: 400 },
    );
  }

  const { items } = body;
  if (!Array.isArray(items) || items.length === 0 || items.some((item) => typeof item !== 'string')) {
    return NextResponse.json(
      { error: { code: 'INVALID_REQUEST_BODY', message: '요청 형식이 올바르지 않습니다.' } },
      { status: 400 },
    );
  }

  // 이 배열은 클라이언트(useCustomExtensionsBatch, Task 6)가 이미 분리·trim·정규화·형식
  // 검증·내부 중복 제거를 마친 값이 기본 경로다. 직접 API를 호출하는 경우에 대비해
  // 서버도 각 항목을 다시 정규화/검증한다.
  const invalidItems: string[] = [];
  const normalizedNames: string[] = [];
  for (const raw of items as string[]) {
    const result = normalizeExtensionInput(raw);
    if (result.ok) {
      normalizedNames.push(result.value);
    } else {
      invalidItems.push(raw);
    }
  }

  if (invalidItems.length > 0) {
    return NextResponse.json(
      { error: { code: 'INVALID_ITEMS', message: '올바르지 않은 항목이 있습니다.', invalidItems } },
      { status: 400 },
    );
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc('add_custom_extensions_batch', { p_names: normalizedNames });

  if (error) {
    if (error.message.includes('CUSTOM_EXTENSION_LIMIT_EXCEEDED')) {
      return NextResponse.json(
        {
          error: {
            code: 'LIMIT_EXCEEDED',
            message: '최대 200개까지 등록할 수 있습니다. 기존 항목을 삭제한 후 다시 추가해주세요.',
          },
        },
        { status: 409 },
      );
    }
    if (error.message.includes('INVALID_EXTENSION_NAME') || error.message.includes('EMPTY_BATCH')) {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST_BODY', message: '요청 형식이 올바르지 않습니다.' } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '저장에 실패했습니다. 잠시 후 다시 시도해주세요.' } },
      { status: 500 },
    );
  }

  return NextResponse.json({
    added: data.added,
    fixedActivated: data.fixed_activated,
    skippedExistingCount: data.skipped_existing_count,
  });
}
