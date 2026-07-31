// components/FileUploadSection.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { validateFilename } from '@/lib/policy/filename';

interface SuccessResult {
  kind: 'success';
  filename: string;
  fileSizeBytes: number;
}

interface FailureResult {
  kind: 'failure';
  filename: string;
  message: string;
}

const GENERIC_FAILURE_MESSAGE = '일시적인 오류가 발생했습니다. 다시 시도해주세요.';
const REQUEST_TOO_LARGE_MESSAGE = '요청할 수 있는 최대 크기를 초과했습니다. 더 작은 파일을 선택해주세요.';
const OFFLINE_MESSAGE = '인터넷 연결을 확인한 후 다시 시도해주세요.';
const NO_RESPONSE_MESSAGE = '서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.';
const TIMEOUT_MESSAGE = '서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.';
const UPLOAD_TIMEOUT_MS = 60000;

interface PendingRequest {
  controller: AbortController;
  timeoutId: ReturnType<typeof setTimeout>;
}

export function FileUploadSection() {
  const [file, setFile] = useState<File | null>(null);
  const [filenameError, setFilenameError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<SuccessResult | FailureResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const failureRef = useRef<HTMLParagraphElement>(null);
  const pendingRequestRef = useRef<PendingRequest | null>(null);

  useEffect(() => {
    if (result?.kind === 'failure') {
      failureRef.current?.focus();
    }
  }, [result]);

  function handleSelect(nextFile: File | null) {
    setFile(nextFile);
    setResult(null);

    if (!nextFile) {
      setFilenameError(null);
      return;
    }

    const validation = validateFilename(nextFile.name);
    setFilenameError(
      validation.ok || validation.reason !== 'FILENAME_TOO_LONG' ? null : '파일명 길이 초과로 업로드할 수 없습니다.',
    );
  }

  async function handleUpload() {
    if (!file || filenameError) return;

    // 벨트 앤 서스펜더스: 버튼이 업로드 중 비활성화되어 정상적으로는 겹치는 시도가
    // 발생하지 않지만, 이 정리 로직 자체는 그 전제에 기대지 않는다.
    if (pendingRequestRef.current) {
      clearTimeout(pendingRequestRef.current.timeoutId);
      pendingRequestRef.current.controller.abort();
      pendingRequestRef.current = null;
    }

    setIsUploading(true);
    setResult(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
    pendingRequestRef.current = { controller, timeoutId };

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/uploads', { method: 'POST', body: formData, signal: controller.signal });

      if (response.ok) {
        const body = await response.json();
        setResult({ kind: 'success', filename: body.originalFilename, fileSizeBytes: body.fileSizeBytes });
        setFile(null);
        setFilenameError(null);
        if (inputRef.current) inputRef.current.value = '';
        return;
      }

      let message = response.status === 413 ? REQUEST_TOO_LARGE_MESSAGE : GENERIC_FAILURE_MESSAGE;
      try {
        const body = await response.json();
        if (body?.error?.message) message = body.error.message;
      } catch {
        // 플랫폼이 자체 413(또는 그 외) 응답을 본문 없이 반환하는 경우, 상태 코드 기반 기본 문구를 사용한다.
      }
      setResult({ kind: 'failure', filename: file.name, message });
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'AbortError'
          ? TIMEOUT_MESSAGE
          : navigator.onLine === false
            ? OFFLINE_MESSAGE
            : NO_RESPONSE_MESSAGE;
      setResult({ kind: 'failure', filename: file.name, message });
    } finally {
      clearTimeout(timeoutId);
      pendingRequestRef.current = null;
      setIsUploading(false);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <label htmlFor="file-input" className="block text-sm font-medium text-gray-900 dark:text-gray-100">
        파일 선택
      </label>
      <input
        id="file-input"
        ref={inputRef}
        type="file"
        disabled={isUploading}
        onChange={(e) => handleSelect(e.target.files?.[0] ?? null)}
        className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-gray-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:file:bg-gray-100 dark:file:text-gray-900 dark:hover:file:bg-gray-300"
      />

      {!file && <p className="text-sm text-gray-500 dark:text-gray-400">업로드할 파일을 선택해주세요.</p>}
      {file && (
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {file.name} ({file.size}바이트)
        </p>
      )}
      {filenameError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {filenameError}
        </p>
      )}

      <button
        type="button"
        onClick={handleUpload}
        disabled={!file || !!filenameError || isUploading}
        className="inline-flex items-center justify-center rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300 dark:disabled:bg-gray-700 dark:disabled:text-gray-400"
      >
        업로드
      </button>

      {isUploading && (
        <p role="status" className="text-sm text-gray-500 dark:text-gray-400">
          업로드 중...
        </p>
      )}

      {result?.kind === 'success' && (
        <p role="status" className="text-sm text-gray-700 dark:text-gray-300">
          {`"${result.filename}" 업로드에 성공했습니다`} ({result.fileSizeBytes}바이트)
        </p>
      )}

      {result?.kind === 'failure' && (
        <p role="alert" tabIndex={-1} ref={failureRef} className="text-sm text-red-600 dark:text-red-400">
          {result.message}
        </p>
      )}
    </section>
  );
}
