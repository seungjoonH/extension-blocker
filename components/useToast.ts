'use client';

import { useCallback, useState } from 'react';

export interface Toast {
  kind: 'success' | 'error';
  message: string;
}

const SUCCESS_AUTO_DISMISS_MS = 3000;

export function useToast() {
  const [toast, setToast] = useState<Toast | null>(null);

  const showSuccess = useCallback((message: string) => {
    setToast({ kind: 'success', message });
    setTimeout(() => setToast((current) => (current?.message === message ? null : current)), SUCCESS_AUTO_DISMISS_MS);
  }, []);

  const showError = useCallback((message: string) => {
    setToast({ kind: 'error', message });
  }, []);

  const dismiss = useCallback(() => setToast(null), []);

  return { toast, showSuccess, showError, dismiss };
}
