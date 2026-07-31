import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server-client';
import { normalizeExtensionInput } from '@/lib/policy/normalize';

export async function POST(request: Request) {
  const { name } = (await request.json()) as { name: string };
  const normalized = normalizeExtensionInput(name ?? '');

  if (!normalized.ok) {
    return NextResponse.json(
      { error: { code: 'INVALID_EXTENSION_FORMAT', message: '허용되지 않는 형식의 확장자입니다.' } },
      { status: 400 },
    );
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc('add_custom_extension', { p_name: normalized.value });

  if (error) {
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
