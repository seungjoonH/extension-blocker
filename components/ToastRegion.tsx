'use client';

import { useEffect, useRef, useState } from 'react';
import type { Toast } from './useToast';

const EXIT_DURATION_MS = 200;

export function ToastRegion({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  // toasts 배열에서 항목이 사라진 뒤에도 퇴장 애니메이션이 끝날 때까지는 화면에
  // 남아있어야 한다. "실제로 그려야 하는 id 목록"을 별도 로컬 상태로 유지하고,
  // 각 id의 마지막 내용은 캐시해 둔다(사라진 뒤에도 toasts 배열에서 더는 찾을 수 없으므로).
  const [displayedIds, setDisplayedIds] = useState<number[]>([]);
  const lastKnownRef = useRef<Map<number, Toast>>(new Map());

  toasts.forEach((t) => lastKnownRef.current.set(t.id, t));

  useEffect(() => {
    setDisplayedIds((prev) => {
      const newIds = toasts.map((t) => t.id).filter((id) => !prev.includes(id));
      return newIds.length > 0 ? [...prev, ...newIds] : prev;
    });
  }, [toasts]);

  function handleExited(id: number) {
    setDisplayedIds((prev) => prev.filter((x) => x !== id));
    lastKnownRef.current.delete(id);
  }

  // 뷰포트 하단에 고정된 오버레이 목록으로 띄운다 — 본문 흐름(flow) 안에 있으면 토스트가
  // 나타나고 사라질 때마다 그 위/아래 콘텐츠 전체가 밀렸다 되돌아오는 레이아웃 이동이
  // 발생한다. flex-col-reverse로 최신 토스트가 기존 토스트 위에 쌓이도록 하고, 목록이
  // 비어 있을 때는 컨테이너 자체가 시각적으로 공간을 차지하지 않으므로 pointer-events-none으로
  // 아래 콘텐츠 클릭을 막지 않게 한다.
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[9999] flex flex-col-reverse items-center gap-3 px-4"
    >
      {displayedIds.map((id) => {
        const toast = lastKnownRef.current.get(id);
        if (!toast) return null;
        const active = toasts.some((t) => t.id === id);
        return (
          <ToastItem
            key={id}
            toast={toast}
            active={active}
            onExited={() => handleExited(id)}
            onDismiss={() => onDismiss(id)}
          />
        );
      })}
    </div>
  );
}

function ToastItem({
  toast,
  active,
  onExited,
  onDismiss,
}: {
  toast: Toast;
  active: boolean;
  onExited: () => void;
  onDismiss: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (active) {
      // 같은 렌더에서 바로 visible을 true로 두면 브라우저가 시작 상태와 끝 상태를
      // 하나로 합쳐버려 트랜지션(진입 애니메이션)이 재생되지 않는다. 한 프레임 뒤로 미룬다.
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    const timer = setTimeout(onExited, EXIT_DURATION_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div
      className={`pointer-events-auto flex w-full max-w-md items-start justify-between gap-3 rounded-lg border border-gray-300 bg-white p-4 text-sm shadow-lg transition-all duration-200 ease-out dark:border-gray-600 dark:bg-gray-800 dark:shadow-black/40 ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
    >
      <p
        className={`font-medium ${
          toast.kind === 'error' ? 'text-red-700 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'
        }`}
      >
        {toast.message}
      </p>
      {toast.kind === 'error' && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="알림 닫기"
          className="shrink-0 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          닫기
        </button>
      )}
    </div>
  );
}
