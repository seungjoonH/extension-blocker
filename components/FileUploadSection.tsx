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

export function FileUploadSection() {
  const [file, setFile] = useState<File | null>(null);
  const [filenameError, setFilenameError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<SuccessResult | FailureResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const failureRef = useRef<HTMLParagraphElement>(null);

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
    setIsUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/uploads', { method: 'POST', body: formData });

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
    } catch {
      const message = navigator.onLine === false ? OFFLINE_MESSAGE : NO_RESPONSE_MESSAGE;
      setResult({ kind: 'failure', filename: file.name, message });
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <section>
      <label htmlFor="file-input">파일 선택</label>
      <input
        id="file-input"
        ref={inputRef}
        type="file"
        disabled={isUploading}
        onChange={(e) => handleSelect(e.target.files?.[0] ?? null)}
      />

      {!file && <p>업로드할 파일을 선택해주세요.</p>}
      {file && (
        <p>
          {file.name} ({file.size}바이트)
        </p>
      )}
      {filenameError && <p role="alert">{filenameError}</p>}

      <button type="button" onClick={handleUpload} disabled={!file || !!filenameError || isUploading}>
        업로드
      </button>

      {isUploading && <p role="status">업로드 중...</p>}

      {result?.kind === 'success' && (
        <p role="status">
          {`"${result.filename}" 업로드에 성공했습니다`} ({result.fileSizeBytes}바이트)
        </p>
      )}

      {result?.kind === 'failure' && (
        <p role="alert" tabIndex={-1} ref={failureRef}>
          {`"${result.filename}"은 `}
          {result.message}
        </p>
      )}
    </section>
  );
}
