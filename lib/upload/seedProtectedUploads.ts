import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServiceRoleClient } from '@/lib/supabase/server-client';
import { saveToStorage } from '@/lib/upload/storage';

export const PROTECTED_UPLOAD_SEEDS = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    originalFilename: 'guideline.md',
    contentType: 'text/markdown',
    relativePath: 'guideline.md',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    originalFilename: 'extignore.valid-200.txt',
    contentType: 'text/plain',
    relativePath: 'extignore.valid-200.txt',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    originalFilename: 'extignore.limit-201.txt',
    contentType: 'text/plain',
    relativePath: 'extignore.limit-201.txt',
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    originalFilename: 'extignore.invalid-chars.txt',
    contentType: 'text/plain',
    relativePath: 'extignore.invalid-chars.txt',
  },
] as const;

/** 시드는 고정 순서로 위에, 나머지는 최신순. */
export function sortUploadListItems<T extends { id: string; createdAt: string }>(items: T[]): T[] {
  const seedOrder = new Map<string, number>(PROTECTED_UPLOAD_SEEDS.map((seed, index) => [seed.id, index]));
  return [...items].sort((a, b) => {
    const aSeed = seedOrder.get(a.id);
    const bSeed = seedOrder.get(b.id);
    const aIsSeed = aSeed !== undefined;
    const bIsSeed = bSeed !== undefined;
    if (aIsSeed && bIsSeed) return aSeed - bSeed;
    if (aIsSeed) return -1;
    if (bIsSeed) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function seedDir() {
  return join(process.cwd(), 'content/seed-uploads');
}

function extractExtension(filename: string): string | null {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === filename.length - 1) return null;
  return filename.slice(lastDot + 1).toLowerCase();
}

/** 보호 시드가 없으면 storage+DB에 넣는다. 이미 있으면 건너뛴다. */
export async function ensureProtectedUploads(): Promise<void> {
  const supabase = createServiceRoleClient();
  const ids = PROTECTED_UPLOAD_SEEDS.map((s) => s.id);
  const { data: existing, error } = await supabase.from('uploads').select('id').in('id', ids);
  if (error) throw error;

  const existingIds = new Set((existing ?? []).map((row) => row.id));

  for (const seed of PROTECTED_UPLOAD_SEEDS) {
    if (existingIds.has(seed.id)) continue;

    const buffer = readFileSync(join(seedDir(), seed.relativePath));
    try {
      await saveToStorage(seed.id, buffer);
    } catch {
      // 이미 storage에만 남아 있는 경우를 대비해 업로드 실패는 무시하고 DB insert를 시도한다.
    }

    const { error: insertError } = await supabase.from('uploads').insert({
      id: seed.id,
      original_filename: seed.originalFilename,
      normalized_extension: extractExtension(seed.originalFilename),
      declared_mime_type: seed.contentType,
      file_size_bytes: buffer.byteLength,
      is_protected: true,
    });

    if (insertError && insertError.code !== '23505') {
      throw insertError;
    }
  }
}
