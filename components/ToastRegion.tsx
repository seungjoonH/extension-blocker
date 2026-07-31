'use client';

import type { Toast } from './useToast';

export function ToastRegion({ toast, onDismiss }: { toast: Toast | null; onDismiss: () => void }) {
  // 뷰포트에 고정된 오버레이로 띄운다 — 본문 흐름(flow) 안에 있으면 토스트가 나타나고
  // 사라질 때마다 그 아래 콘텐츠 전체가 밀렸다 되돌아오는 레이아웃 이동이 발생한다.
  // 토스트가 없을 때는 이 컨테이너 자체가 시각적으로 아무 공간도 차지하지 않으므로
  // pointer-events-none으로 아래 콘텐츠 클릭을 막지 않게 한다.
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center px-4"
    >
      {toast && (
        <div className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-md border border-gray-200 bg-white p-3 text-sm dark:border-gray-700 dark:bg-gray-800">
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
        </div>
      )}
    </div>
  );
}
