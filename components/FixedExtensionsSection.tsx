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
  const [savingName, setSavingName] = useState<string | null>(null);
  const [unsavedNames, setUnsavedNames] = useState<Set<string>>(new Set());
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => setState(extensions), [extensions]);

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
      setSavingName(name);
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
        setSavingName(null);
        setUnsavedNames((prev) => {
          const next = new Set(prev);
          next.delete(name);
          return next;
        });
      }
    }, SAVE_DEBOUNCE_MS);
  }

  return (
    <fieldset>
      <legend>고정 확장자</legend>
      {state.map((ext) => (
        <label key={ext.name} htmlFor={`fixed-${ext.name}`}>
          <input
            id={`fixed-${ext.name}`}
            type="checkbox"
            checked={ext.active}
            onChange={() => handleToggle(ext.name)}
          />
          {ext.name}
        </label>
      ))}
      {savingName && <span role="status">저장 중</span>}
    </fieldset>
  );
}
