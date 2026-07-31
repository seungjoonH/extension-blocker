'use client';

import { useCallback, useRef, useState } from 'react';

export interface Toast {
  id: number;
  kind: 'success' | 'error';
  message: string;
}

const SUCCESS_AUTO_DISMISS_MS = 3000;
const MAX_VISIBLE_TOASTS = 3;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  // 토스트별 자동 소멸 타이머. id 기준으로 관리해 한 토스트의 제거가 다른 토스트의
  // 타이머에 영향을 주지 않는다.
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const clearTimer = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      clearTimer(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    },
    [clearTimer],
  );

  const addToast = useCallback((kind: Toast['kind'], message: string) => {
    const id = ++nextId.current;
    setToasts((prev) => {
      const next = [...prev, { id, kind, message }];
      if (next.length <= MAX_VISIBLE_TOASTS) return next;
      // 최대 개수를 넘으면 가장 오래된 것부터 제거한다(각자의 타이머도 함께 정리).
      const overflow = next.slice(0, next.length - MAX_VISIBLE_TOASTS);
      overflow.forEach((t) => clearTimer(t.id));
      return next.slice(next.length - MAX_VISIBLE_TOASTS);
    });
    return id;
  }, [clearTimer]);

  const showSuccess = useCallback(
    (message: string) => {
      const id = addToast('success', message);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), SUCCESS_AUTO_DISMISS_MS),
      );
    },
    [addToast, dismiss],
  );

  const showError = useCallback(
    (message: string) => {
      addToast('error', message);
    },
    [addToast],
  );

  return { toasts, showSuccess, showError, dismiss };
}
