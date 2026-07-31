import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { deleteFromStorage, saveToStorage } from './storage';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

describe('Storage 저장과 삭제', () => {
  it('버퍼를 저장하고 다시 삭제할 수 있다', async () => {
    const id = randomUUID();
    await saveToStorage(id, Buffer.from('hello'));

    const supabase = createServiceRoleClient();
    const { data } = await supabase.storage
      .from(process.env.SUPABASE_STORAGE_BUCKET ?? 'uploads')
      .download(`uploads/${id}`);
    expect(data).not.toBeNull();

    const result = await deleteFromStorage(id);
    expect(result.ok).toBe(true);
  });

  it('존재하지 않는 객체를 삭제해도 실패로 처리하지 않는다', async () => {
    const result = await deleteFromStorage(randomUUID());
    expect(result.ok).toBe(true);
  });
});
