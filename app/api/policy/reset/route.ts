import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

export async function POST() {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc('reset_extension_policy');

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '초기화에 실패했습니다. 잠시 후 다시 시도해주세요.' } },
      { status: 500 },
    );
  }

  return NextResponse.json({
    deletedCustomCount: data.deleted_custom_count,
    deactivatedFixedCount: data.deactivated_fixed_count,
  });
}
