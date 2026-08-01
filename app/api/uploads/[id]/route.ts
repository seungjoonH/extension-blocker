import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server-client';
import { deleteFromStorage } from '@/lib/upload/storage';

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('uploads')
    .select('id, is_protected')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '삭제에 실패했습니다. 잠시 후 다시 시도해주세요.' } },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: '파일을 찾을 수 없습니다.' } },
      { status: 404 },
    );
  }
  if (data.is_protected) {
    return NextResponse.json(
      { error: { code: 'PROTECTED_UPLOAD', message: '이 파일은 삭제할 수 없습니다.' } },
      { status: 403 },
    );
  }

  const cleanup = await deleteFromStorage(id);
  if (!cleanup.ok) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '삭제에 실패했습니다. 잠시 후 다시 시도해주세요.' } },
      { status: 500 },
    );
  }

  const { error: deleteError } = await supabase.from('uploads').delete().eq('id', id);
  if (deleteError) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '삭제에 실패했습니다. 잠시 후 다시 시도해주세요.' } },
      { status: 500 },
    );
  }

  return new NextResponse(null, { status: 204 });
}
