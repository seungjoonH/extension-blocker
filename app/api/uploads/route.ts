import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { runUploadPipeline } from '@/lib/upload/pipeline';
import { UploadError } from '@/lib/policy/errors';
import { logUploadResult } from '@/lib/logging/logger';
import { createServiceRoleClient } from '@/lib/supabase/server-client';
import { ensureProtectedUploads, sortUploadListItems } from '@/lib/upload/seedProtectedUploads';

const SERVER_MAX_REQUEST_BYTES = Number(process.env.SERVER_MAX_REQUEST_BYTES ?? 58720256);

export async function GET() {
  try {
    await ensureProtectedUploads();
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('uploads')
      .select('id, original_filename, file_size_bytes, created_at, is_protected')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: '목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.' } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      items: sortUploadListItems(
        (data ?? []).map((row) => ({
          id: row.id,
          originalFilename: row.original_filename,
          fileSizeBytes: row.file_size_bytes,
          createdAt: row.created_at,
          isProtected: row.is_protected,
        })),
      ),
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.' } },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const start = Date.now();

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > SERVER_MAX_REQUEST_BYTES) {
    logUploadResult({ requestId, result: 'rejected', reason: 'REQUEST_TOO_LARGE', durationMs: Date.now() - start });
    return NextResponse.json(
      { error: { code: 'REQUEST_TOO_LARGE', message: '요청할 수 있는 최대 크기를 초과했습니다. 더 작은 파일을 선택해주세요.' } },
      { status: 413 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    logUploadResult({
      requestId,
      result: 'rejected',
      reason: 'INVALID_UPLOAD_REQUEST',
      detail: 'INVALID_MULTIPART_REQUEST',
      durationMs: Date.now() - start,
    });
    return NextResponse.json(
      { error: { code: 'INVALID_MULTIPART_REQUEST', message: '업로드 요청 형식이 올바르지 않습니다.' } },
      { status: 400 },
    );
  }

  const files = formData.getAll('file').filter((value): value is File => value instanceof File);
  if (files.length === 0) {
    logUploadResult({
      requestId,
      result: 'rejected',
      reason: 'INVALID_UPLOAD_REQUEST',
      detail: 'FILE_REQUIRED',
      durationMs: Date.now() - start,
    });
    return NextResponse.json(
      { error: { code: 'FILE_REQUIRED', message: '업로드할 파일을 선택해주세요.' } },
      { status: 400 },
    );
  }
  if (files.length > 1) {
    logUploadResult({
      requestId,
      result: 'rejected',
      reason: 'INVALID_UPLOAD_REQUEST',
      detail: 'MULTIPLE_FILES_NOT_ALLOWED',
      durationMs: Date.now() - start,
    });
    return NextResponse.json(
      { error: { code: 'MULTIPLE_FILES_NOT_ALLOWED', message: '한 번에 파일 하나만 업로드할 수 있습니다.' } },
      { status: 400 },
    );
  }

  try {
    const result = await runUploadPipeline({ file: files[0], requestId });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof UploadError) {
      return NextResponse.json({ error: { code: error.code, message: error.userMessage } }, { status: error.status });
    }
    logUploadResult({ requestId, result: 'failed', reason: 'INTERNAL_ERROR', durationMs: Date.now() - start });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '일시적인 오류가 발생했습니다. 다시 시도해주세요.' } },
      { status: 500 },
    );
  }
}
