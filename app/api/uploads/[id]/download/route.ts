import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server-client';
import { downloadFromStorage } from '@/lib/upload/storage';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('uploads')
    .select('id, original_filename')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '다운로드에 실패했습니다. 잠시 후 다시 시도해주세요.' } },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: '파일을 찾을 수 없습니다.' } },
      { status: 404 },
    );
  }

  try {
    const blob = await downloadFromStorage(id);
    const buffer = Buffer.from(await blob.arrayBuffer());
    const encodedName = encodeURIComponent(data.original_filename);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`,
      },
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '다운로드에 실패했습니다. 잠시 후 다시 시도해주세요.' } },
      { status: 500 },
    );
  }
}
