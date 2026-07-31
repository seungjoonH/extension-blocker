import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

export async function GET() {
  const supabase = createServiceRoleClient();

  const [extensionsResult, settingsResult] = await Promise.all([
    supabase.from('extension_policy').select('id, name, kind, active').order('created_at', { ascending: true }),
    supabase.from('upload_settings').select('max_upload_size_bytes').eq('id', 1).single(),
  ]);

  if (extensionsResult.error || settingsResult.error || !extensionsResult.data || !settingsResult.data) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '정책을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.' } },
      { status: 500 },
    );
  }

  const extensions = extensionsResult.data;

  return NextResponse.json({
    fixedExtensions: extensions
      .filter((e) => e.kind === 'fixed')
      .map((e) => ({ name: e.name, active: e.active })),
    customExtensions: extensions
      .filter((e) => e.kind === 'custom')
      .map((e) => ({ id: e.id, name: e.name })),
    maxUploadSizeBytes: settingsResult.data.max_upload_size_bytes,
  });
}
