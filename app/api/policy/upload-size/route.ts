import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

const ALLOWED_SIZES = [1048576, 5242880, 10485760, 20971520, 52428800];

export async function PUT(request: Request) {
  const { maxUploadSizeBytes } = (await request.json()) as { maxUploadSizeBytes: number };

  if (!ALLOWED_SIZES.includes(maxUploadSizeBytes)) {
    return NextResponse.json(
      { error: { code: 'INVALID_UPLOAD_SIZE', message: '허용되지 않는 업로드 크기입니다.' } },
      { status: 400 },
    );
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from('upload_settings')
    .update({ max_upload_size_bytes: maxUploadSizeBytes, updated_at: new Date().toISOString() })
    .eq('id', 1);

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '저장에 실패했습니다. 잠시 후 다시 시도해주세요.' } },
      { status: 500 },
    );
  }

  return NextResponse.json({ maxUploadSizeBytes });
}
