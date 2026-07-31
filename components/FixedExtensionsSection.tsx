// components/FixedExtensionsSection.tsx
'use client';

import { useEffect, useRef, useState } from 'react';

interface FixedExtension {
  name: string;
  active: boolean;
}

const SAVE_DEBOUNCE_MS = 500;

export function FixedExtensionsSection({
  extensions,
  onSaveSuccess,
  onSaveError,
  onResync,
}: {
  extensions: FixedExtension[];
  onSaveSuccess: (message: string) => void;
  onSaveError: (message: string) => void;
  onResync: () => void;
}) {
  const [state, setState] = useState(extensions);
  const [savingNames, setSavingNames] = useState<Set<string>>(new Set());
  const [unsavedNames, setUnsavedNames] = useState<Set<string>>(new Set());
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const unsavedNamesRef = useRef<Set<string>>(unsavedNames);

  useEffect(() => {
    unsavedNamesRef.current = unsavedNames;
  }, [unsavedNames]);

  // extensions prop이 갱신될 때(초기 로드, onResync에 의한 재조회), 현재 편집 중(unsavedNames)인
  // 항목은 서버 값으로 덮어쓰지 않고 낙관적 상태를 유지한다. unsavedNamesRef를 사용해 이 effect가
  // unsavedNames 변경만으로는(예: 저장 완료로 목록에서 빠질 때) 재실행되어 다른 항목의 이미 반영된
  // 상태를 되돌리는 일이 없도록 한다.
  useEffect(() => {
    setState((prev) =>
      extensions.map((e) => (unsavedNamesRef.current.has(e.name) ? (prev.find((p) => p.name === e.name) ?? e) : e)),
    );
  }, [extensions]);

  useEffect(() => {
    if (unsavedNames.size === 0) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [unsavedNames]);

  function handleToggle(name: string) {
    setState((prev) => prev.map((e) => (e.name === name ? { ...e, active: !e.active } : e)));
    setUnsavedNames((prev) => new Set(prev).add(name));

    if (timers.current[name]) {
      clearTimeout(timers.current[name]);
    }

    timers.current[name] = setTimeout(async () => {
      setSavingNames((prev) => new Set(prev).add(name));
      const target = state.find((e) => e.name === name);
      const nextActive = target ? !target.active : true;
      try {
        const response = await fetch(`/api/policy/fixed-extensions/${name}`, {
          method: 'PATCH',
          body: JSON.stringify({ active: nextActive }),
        });

        if (response.ok) {
          onSaveSuccess(`"${name}" 설정이 저장되었습니다.`);
        } else {
          onSaveError(`"${name}" 저장에 실패했습니다. 잠시 후 다시 시도해주세요.`);
          onResync();
        }
      } catch {
        onSaveError(`"${name}" 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.`);
        onResync();
      } finally {
        setSavingNames((prev) => {
          const next = new Set(prev);
          next.delete(name);
          return next;
        });
        setUnsavedNames((prev) => {
          const next = new Set(prev);
          next.delete(name);
          return next;
        });
      }
    }, SAVE_DEBOUNCE_MS);
  }

  return (
    <fieldset className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <legend className="text-sm font-medium text-gray-900 dark:text-gray-100">고정 확장자</legend>
      {state.map((ext) => (
        <label
          key={ext.name}
          htmlFor={`fixed-${ext.name}`}
          className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        >
          <input
            id={`fixed-${ext.name}`}
            type="checkbox"
            checked={ext.active}
            onChange={() => handleToggle(ext.name)}
            className="h-4 w-4"
          />
          {ext.name}
          {savingNames.has(ext.name) && (
            <span role="status" className="text-xs text-gray-500 dark:text-gray-400">
              저장 중
            </span>
          )}
        </label>
      ))}
    </fieldset>
  );
}
