import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

describe('uploads 마이그레이션', () => {
  const supabase = createServiceRoleClient();

  it('정상 메타데이터를 저장할 수 있다', async () => {
    const id = randomUUID();
    const { error } = await supabase.from('uploads').insert({
      id,
      original_filename: 'report.pdf',
      normalized_extension: 'pdf',
      declared_mime_type: 'application/pdf',
      file_size_bytes: 1024,
    });

    expect(error).toBeNull();
    await supabase.from('uploads').delete().eq('id', id);
  });

  it('file_size_bytes가 음수면 거부한다', async () => {
    const { error } = await supabase.from('uploads').insert({
      id: randomUUID(),
      original_filename: 'x.txt',
      file_size_bytes: -1,
    });

    expect(error?.message).toMatch(/uploads_file_size_bytes_non_negative/);
  });

  it('declared_mime_type이 255자를 넘으면 거부한다', async () => {
    const { error } = await supabase.from('uploads').insert({
      id: randomUUID(),
      original_filename: 'x.txt',
      file_size_bytes: 1,
      declared_mime_type: 'a'.repeat(256),
    });

    expect(error?.message).toMatch(/uploads_declared_mime_type_length/);
  });
});
