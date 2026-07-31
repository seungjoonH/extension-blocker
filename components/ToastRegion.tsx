'use client';

import type { Toast } from './useToast';

export function ToastRegion({ toast, onDismiss }: { toast: Toast | null; onDismiss: () => void }) {
  return (
    <div role="status" aria-live="polite">
      {toast && (
        <>
          <p>{toast.message}</p>
          {toast.kind === 'error' && (
            <button type="button" onClick={onDismiss} aria-label="알림 닫기">
              닫기
            </button>
          )}
        </>
      )}
    </div>
  );
}
