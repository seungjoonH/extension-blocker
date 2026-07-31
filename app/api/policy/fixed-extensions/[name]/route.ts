import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

export async function PATCH(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;

  let body: { active?: unknown };
  try {
    body = (await request.json()) as { active?: unknown };
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_REQUEST_BODY', message: '요청 형식이 올바르지 않습니다.' } },
      { status: 400 },
    );
  }

  const { active } = body;
  if (typeof active !== 'boolean') {
    return NextResponse.json(
      { error: { code: 'INVALID_REQUEST_BODY', message: '요청 형식이 올바르지 않습니다.' } },
      { status: 400 },
    );
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('extension_policy')
    .update({ active })
    .eq('name', name)
    .eq('kind', 'fixed')
    .select('name, active')
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '저장에 실패했습니다. 잠시 후 다시 시도해주세요.' } },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: '존재하지 않는 고정 확장자입니다.' } },
      { status: 404 },
    );
  }

  return NextResponse.json(data);
}
