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
  // setToasts의 함수형 업데이터는 커밋 시점에 실행되어 호출 직후 동기적으로 결과를
  // 읽을 수 없다. 중복 판단과 반환할 id를 그 자리에서 동기적으로 결정해야 하므로,
  // 항상 최신 배열을 담고 있는 ref를 별도로 유지한다.
  const toastsRef = useRef<Toast[]>([]);
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
      toastsRef.current = toastsRef.current.filter((t) => t.id !== id);
      setToasts(toastsRef.current);
    },
    [clearTimer],
  );

  // 같은 종류(kind)와 같은 메시지의 토스트가 이미 표시 중이면 새로 추가하지 않고
  // 기존 항목의 id를 그대로 반환한다(중복 판단은 유형+메시지 조합 기준 — 성공과
  // 실패는 문구가 같아도 서로 다른 알림으로 취급한다). 새로 추가할 때 최대 개수를
  // 넘으면 가장 오래된 토스트부터 제거한다.
  const addToast = useCallback(
    (kind: Toast['kind'], message: string) => {
      const existing = toastsRef.current.find((t) => t.kind === kind && t.message === message);
      if (existing) return existing.id;

      const id = ++nextId.current;
      let next = [...toastsRef.current, { id, kind, message }];
      if (next.length > MAX_VISIBLE_TOASTS) {
        const overflow = next.slice(0, next.length - MAX_VISIBLE_TOASTS);
        overflow.forEach((t) => clearTimer(t.id));
        next = next.slice(next.length - MAX_VISIBLE_TOASTS);
      }
      toastsRef.current = next;
      setToasts(next);
      return id;
    },
    [clearTimer],
  );

  const showSuccess = useCallback(
    (message: string) => {
      const id = addToast('success', message);
      // 이미 표시 중인 동일 알림이었더라도 표시 시간을 다시 3초로 갱신한다.
      clearTimer(id);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), SUCCESS_AUTO_DISMISS_MS),
      );
    },
    [addToast, clearTimer, dismiss],
  );

  const showError = useCallback(
    (message: string) => {
      // 오류 토스트는 자동 소멸 타이머가 없으므로, 이미 같은 오류가 표시 중이면
      // 아무 것도 하지 않고 기존 항목을 그대로 유지한다.
      addToast('error', message);
    },
    [addToast],
  );

  return { toasts, showSuccess, showError, dismiss };
}
