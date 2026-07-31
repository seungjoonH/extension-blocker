'use client';

import type { Toast } from './useToast';

export function ToastRegion({ toast, onDismiss }: { toast: Toast | null; onDismiss: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={
        toast
          ? 'flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-700 dark:bg-gray-800'
          : undefined
      }
    >
      {toast && (
        <>
          <p className={toast.kind === 'error' ? 'text-red-700 dark:text-red-400' : 'text-gray-800 dark:text-gray-100'}>
            {toast.message}
          </p>
          {toast.kind === 'error' && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="알림 닫기"
              className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              닫기
            </button>
          )}
        </>
      )}
    </div>
  );
}
