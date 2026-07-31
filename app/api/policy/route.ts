import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

// PLANNING.md §5.1이 명시한 고정 확장자 표시 순서. 알파벳 순과는 다르다
// (scr이 js보다 먼저 온다). 이 7개는 0001_extension_policy.sql이 단일
// INSERT 문으로 삽입해 created_at이 모두 동일하므로, DB의 created_at 정렬은
// 사실상 tie-break가 없는 것과 같다 — active를 UPDATE하면 Postgres MVCC
// 힙 저장 방식상 물리적 행 위치가 바뀔 수 있어 이 순서가 저장/새로고침마다
// 흔들릴 수 있다. 그래서 정렬을 DB에 위임하지 않고 애플리케이션에서
// 고정된 순서로 강제한다.
const FIXED_EXTENSION_ORDER = ['bat', 'cmd', 'com', 'cpl', 'exe', 'scr', 'js'] as const;

export async function GET() {
  const supabase = createServiceRoleClient();

  const [extensionsResult, settingsResult] = await Promise.all([
    supabase
      .from('extension_policy')
      .select('id, name, kind, active')
      .order('created_at', { ascending: true })
      .order('name', { ascending: true }),
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
      .map((e) => ({ name: e.name, active: e.active }))
      .sort(
        (a, b) =>
          FIXED_EXTENSION_ORDER.indexOf(a.name as (typeof FIXED_EXTENSION_ORDER)[number]) -
          FIXED_EXTENSION_ORDER.indexOf(b.name as (typeof FIXED_EXTENSION_ORDER)[number]),
      ),
    customExtensions: extensions
      .filter((e) => e.kind === 'custom')
      .map((e) => ({ id: e.id, name: e.name })),
    maxUploadSizeBytes: settingsResult.data.max_upload_size_bytes,
  });
}
