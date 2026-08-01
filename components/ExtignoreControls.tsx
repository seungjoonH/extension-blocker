'use client';

import { useRef } from 'react';
import { buildExtignoreContent, EXTIGNORE_FILENAME, ExtignorePolicyInput } from '@/lib/policy/extignore';
import { ButtonLoadingContent } from './ButtonSpinner';

export function ExtignoreControls({
  policy,
  onImportFile,
  isSubmitting,
}: {
  policy: ExtignorePolicyInput;
  onImportFile: (file: File) => void;
  isSubmitting: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      onImportFile(file);
    }
    // 같은 파일을 다시 선택해도 onChange가 재발생하도록 값을 비운다.
    event.target.value = '';
  }

  function handleExport() {
    const content = buildExtignoreContent(policy);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = EXTIGNORE_FILENAME;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-row flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isSubmitting}
        aria-busy={isSubmitting}
        aria-label={isSubmitting ? '가져오는 중' : `${EXTIGNORE_FILENAME} 가져오기`}
        className="inline-grid place-items-center rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <ButtonLoadingContent idleLabel="가져오기" isLoading={isSubmitting} />
      </button>
      <input
        ref={fileInputRef}
        type="file"
        aria-label={`${EXTIGNORE_FILENAME} 파일 선택`}
        accept=".txt,text/plain"
        onChange={handleFileChange}
        className="sr-only"
      />
      <button
        type="button"
        onClick={handleExport}
        aria-label={`${EXTIGNORE_FILENAME} 내보내기`}
        className="inline-flex items-center justify-center rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        내보내기
      </button>
    </div>
  );
}
