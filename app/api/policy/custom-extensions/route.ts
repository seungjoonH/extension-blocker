import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server-client';
import { describeExtensionFormatError, normalizeExtensionInput } from '@/lib/policy/normalize';

export async function POST(request: Request) {
  let body: { name?: unknown };
  try {
    body = (await request.json()) as { name?: unknown };
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_REQUEST_BODY', message: '요청 형식이 올바르지 않습니다.' } },
      { status: 400 },
    );
  }

  const { name } = body;
  if (name !== undefined && typeof name !== 'string') {
    return NextResponse.json(
      { error: { code: 'INVALID_REQUEST_BODY', message: '요청 형식이 올바르지 않습니다.' } },
      { status: 400 },
    );
  }

  const normalized = normalizeExtensionInput(name ?? '');

  if (!normalized.ok) {
    return NextResponse.json(
      { error: { code: 'INVALID_EXTENSION_FORMAT', message: describeExtensionFormatError(normalized.reason) } },
      { status: 400 },
    );
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc('add_custom_extension', { p_name: normalized.value });

  if (error) {
    // Postgres 유니크 제약 위반(23505) — add_custom_extension RPC 내부의
    // DUPLICATE_EXTENSION 검사를 우회하는 예외적인 동시 INSERT 경로에 대한
    // 최종 방어선이다(DESIGN.md §5.2).
    if (error.code === '23505') {
      return NextResponse.json(
        { error: { code: 'DUPLICATE_EXTENSION', message: '이미 등록된 확장자입니다.' } },
        { status: 409 },
      );
    }
    if (error.message.includes('DUPLICATE_EXTENSION')) {
      return NextResponse.json(
        { error: { code: 'DUPLICATE_EXTENSION', message: '이미 등록된 확장자입니다.' } },
        { status: 409 },
      );
    }
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
    // RPC 내부에서도 입력 형식을 다시 검증한다(add_custom_extension_rpc.sql) —
    // 애플리케이션 검증(normalizeExtensionInput)을 우회하는 예외적인 호출에
    // 대한 방어선이다. 애플리케이션 검증과 동일한 오류 코드/메시지로 매핑한다.
    if (error.message.includes('INVALID_EXTENSION_NAME')) {
      return NextResponse.json(
        { error: { code: 'INVALID_EXTENSION_FORMAT', message: describeExtensionFormatError('INVALID_CHARACTERS') } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '저장에 실패했습니다. 잠시 후 다시 시도해주세요.' } },
      { status: 500 },
    );
  }

  if (data.result === 'custom_created') {
    return NextResponse.json(
      { result: 'custom_created', customExtension: { id: data.id, name: data.name } },
      { status: 201 },
    );
  }

  return NextResponse.json(
    { result: data.result, fixedExtension: { name: data.name, active: data.active } },
    { status: 200 },
  );
}
