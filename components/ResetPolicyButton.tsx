'use client';

import { useState } from 'react';
import { ButtonLoadingContent } from './ButtonSpinner';

export function ResetPolicyButton({
  disabled,
  onSaveSuccess,
  onSaveError,
  onResync,
}: {
  disabled: boolean;
  onSaveSuccess: (message: string) => void;
  onSaveError: (message: string) => void;
  onResync: () => void;
}) {
  const [isResetting, setIsResetting] = useState(false);

  async function handleReset() {
    const confirmed = window.confirm('커스텀 확장자를 모두 삭제하고 고정 확장자를 모두 비활성화합니다. 계속할까요?');
    if (!confirmed) return;

    setIsResetting(true);
    try {
      const response = await fetch('/api/policy/reset', { method: 'POST' });
      if (response.ok) {
        onSaveSuccess('확장자 정책이 초기화되었습니다.');
        onResync();
      } else {
        onSaveError('초기화에 실패했습니다. 잠시 후 다시 시도해주세요.');
      }
    } catch {
      onSaveError('초기화 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleReset}
      disabled={disabled || isResetting}
      aria-busy={isResetting}
      aria-label="확장자 정책 초기화"
      className="inline-grid place-items-center rounded border border-red-300 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950 dark:disabled:border-gray-800 dark:disabled:text-gray-600"
    >
      <ButtonLoadingContent idleLabel="초기화" isLoading={isResetting} />
    </button>
  );
}
