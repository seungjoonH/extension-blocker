import { createServiceRoleClient } from '@/lib/supabase/server-client';

function bucket() {
  return process.env.SUPABASE_STORAGE_BUCKET ?? 'uploads';
}

function objectKey(id: string) {
  return `uploads/${id}`;
}

export async function saveToStorage(id: string, buffer: Buffer): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.storage
    .from(bucket())
    .upload(objectKey(id), buffer, { contentType: 'application/octet-stream' });

  if (error) {
    throw error;
  }
}

export async function deleteFromStorage(id: string): Promise<{ ok: boolean }> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.storage.from(bucket()).remove([objectKey(id)]);
  return { ok: !error };
}
