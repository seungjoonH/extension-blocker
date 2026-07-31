'use client';

import { useEffect, useState } from 'react';

const OPTIONS = [
  { label: '1MB', value: 1048576 },
  { label: '5MB', value: 5242880 },
  { label: '10MB', value: 10485760 },
  { label: '20MB', value: 20971520 },
  { label: '50MB', value: 52428800 },
];

export function UploadSizeSection({
  maxUploadSizeBytes,
  onSaveSuccess,
  onSaveError,
}: {
  maxUploadSizeBytes: number;
  onSaveSuccess: (message: string) => void;
  onSaveError: (message: string) => void;
}) {
  const [value, setValue] = useState(maxUploadSizeBytes);

  useEffect(() => setValue(maxUploadSizeBytes), [maxUploadSizeBytes]);

  async function handleChange(next: number) {
    const previous = value;
    setValue(next);
    try {
      const response = await fetch('/api/policy/upload-size', {
        method: 'PUT',
        body: JSON.stringify({ maxUploadSizeBytes: next }),
      });
      if (response.ok) {
        onSaveSuccess('업로드 최대 크기가 저장되었습니다.');
      } else {
        setValue(previous);
        onSaveError('저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
      }
    } catch {
      setValue(previous);
      onSaveError('저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    }
  }

  return (
    <label
      htmlFor="upload-size-select"
      className="block rounded-lg border border-gray-200 bg-white p-4 text-sm font-medium text-gray-900 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
    >
      업로드 최대 크기
      <select
        id="upload-size-select"
        value={value}
        onChange={(e) => handleChange(Number(e.target.value))}
        className="mt-2 block w-full max-w-xs rounded-md border border-gray-300 px-3 py-1.5 text-sm font-normal dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
