'use client';

import { useCallback, useRef, useState } from 'react';

export interface Toast {
  kind: 'success' | 'error';
  message: string;
}

const SUCCESS_AUTO_DISMISS_MS = 3000;

export function useToast() {
  const [toast, setToast] = useState<Toast | null>(null);
  const latestToastId = useRef(0);

  const showSuccess = useCallback((message: string) => {
    const toastId = ++latestToastId.current;
    setToast({ kind: 'success', message });
    setTimeout(() => {
      setToast((current) => (latestToastId.current === toastId ? null : current));
    }, SUCCESS_AUTO_DISMISS_MS);
  }, []);

  const showError = useCallback((message: string) => {
    latestToastId.current += 1;
    setToast({ kind: 'error', message });
  }, []);

  const dismiss = useCallback(() => {
    latestToastId.current += 1;
    setToast(null);
  }, []);

  return { toast, showSuccess, showError, dismiss };
}
