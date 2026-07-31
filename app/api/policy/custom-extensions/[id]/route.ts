import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceRoleClient();

  const { error } = await supabase.from('extension_policy').delete().eq('id', id).eq('kind', 'custom');

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '삭제에 실패했습니다. 잠시 후 다시 시도해주세요.' } },
      { status: 500 },
    );
  }

  return new NextResponse(null, { status: 204 });
}
