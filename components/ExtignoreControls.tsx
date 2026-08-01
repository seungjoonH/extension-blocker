'use client';

import { useRef } from 'react';
import { buildExtignoreContent, ExtignorePolicyInput } from '@/lib/policy/extignore';

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
    link.download = '.extignore';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isSubmitting}
        className="inline-flex items-center justify-center rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        .extignore 가져오기
      </button>
      <input
        ref={fileInputRef}
        type="file"
        aria-label=".extignore 파일 선택"
        accept=".extignore,text/plain"
        onChange={handleFileChange}
        className="sr-only"
      />
      <button
        type="button"
        onClick={handleExport}
        className="inline-flex items-center justify-center rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        .extignore 내보내기
      </button>
    </div>
  );
}
