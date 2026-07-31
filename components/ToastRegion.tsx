'use client';

import { useEffect, useRef, useState } from 'react';
import type { Toast } from './useToast';

const EXIT_DURATION_MS = 200;

export function ToastRegion({ toast, onDismiss }: { toast: Toast | null; onDismiss: () => void }) {
  // toast prop은 사라질 때 즉시 null이 되지만, 퇴장 애니메이션이 재생되는 동안은
  // 마지막 내용을 화면에 그대로 유지해야 한다. 그래서 실제로 렌더링하는 내용(displayed)을
  // toast prop과 분리해 한 박자 늦게(퇴장 애니메이션 시간만큼) 따라가게 한다.
  const [displayed, setDisplayed] = useState<Toast | null>(null);
  const [visible, setVisible] = useState(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }

    if (toast) {
      setDisplayed(toast);
      // 같은 렌더에서 바로 visible을 true로 두면 브라우저가 시작 상태와 끝 상태를
      // 하나로 합쳐버려 트랜지션(진입 애니메이션)이 재생되지 않는다. 한 프레임 뒤로 미룬다.
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }

    setVisible(false);
    exitTimerRef.current = setTimeout(() => {
      setDisplayed(null);
      exitTimerRef.current = null;
    }, EXIT_DURATION_MS);
    return () => {
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
    };
  }, [toast]);

  // 뷰포트 하단에 고정된 오버레이로 띄운다 — 본문 흐름(flow) 안에 있으면 토스트가
  // 나타나고 사라질 때마다 그 위/아래 콘텐츠 전체가 밀렸다 되돌아오는 레이아웃
  // 이동이 발생한다. 토스트가 없을 때는 이 컨테이너 자체가 시각적으로 아무 공간도
  // 차지하지 않으므로 pointer-events-none으로 아래 콘텐츠 클릭을 막지 않게 한다.
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
    >
      {displayed && (
        <div
          className={`pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-md border border-gray-200 bg-white p-3 text-sm transition-all duration-200 ease-out dark:border-gray-700 dark:bg-gray-800 ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          }`}
        >
          <p
            className={displayed.kind === 'error' ? 'text-red-700 dark:text-red-400' : 'text-gray-800 dark:text-gray-100'}
          >
            {displayed.message}
          </p>
          {displayed.kind === 'error' && (
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
