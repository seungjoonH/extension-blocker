// components/CustomExtensionsSection.tsx
'use client';

import { useEffect, useRef, useState } from 'react';

interface CustomExtension {
  id: string;
  name: string;
}

const INLINE_ERROR_CODES = new Set(['INVALID_EXTENSION_FORMAT', 'DUPLICATE_EXTENSION', 'LIMIT_EXCEEDED']);

export function CustomExtensionsSection({
  extensions,
  onSaveSuccess,
  onSaveError,
}: {
  extensions: CustomExtension[];
  onSaveSuccess: (message: string) => void;
  onSaveError: (message: string) => void;
}) {
  const [list, setList] = useState(extensions);
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingFocusIdRef = useRef<string | null>(null);

  const trimmed = input.trim();
  const canSubmit = trimmed.length > 0 && !isSubmitting && list.length < 200;

  useEffect(() => {
    if (!pendingFocusIdRef.current) return;
    const id = pendingFocusIdRef.current;
    pendingFocusIdRef.current = null;
    document.getElementById(id)?.focus();
  }, [list]);

  async function handleAdd() {
    setIsSubmitting(true);
    setInlineError(null);
    try {
      const response = await fetch('/api/policy/custom-extensions', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed }),
      });
      const body = await response.json();

      if (!response.ok) {
        if (INLINE_ERROR_CODES.has(body.error.code)) {
          setInlineError(body.error.message);
          inputRef.current?.focus();
        } else {
          onSaveError(body.error.message);
        }
        return;
      }

      if (body.result === 'custom_created') {
        setList((prev) => [...prev, body.customExtension]);
        setInput('');
        onSaveSuccess(`"${body.customExtension.name}"이(가) 등록되었습니다.`);
      } else if (body.result === 'fixed_auto_activated') {
        onSaveSuccess(`"${body.fixedExtension.name}"은(는) 고정 차단 목록에 자동으로 추가되었습니다.`);
        document.getElementById(`fixed-${body.fixedExtension.name}`)?.focus();
      } else if (body.result === 'fixed_already_active') {
        onSaveSuccess(`"${body.fixedExtension.name}"은(는) 이미 차단 중인 확장자입니다.`);
      }
    } catch {
      onSaveError('저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    const index = list.findIndex((e) => e.id === id);
    const next = list[index + 1];
    pendingFocusIdRef.current = next ? `custom-ext-delete-${next.id}` : 'custom-extension-input';

    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      const response = await fetch(`/api/policy/custom-extensions/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setList((prev) => prev.filter((e) => e.id !== id));
      } else {
        pendingFocusIdRef.current = null;
        onSaveError('삭제에 실패했습니다. 잠시 후 다시 시도해주세요.');
      }
    } catch {
      pendingFocusIdRef.current = null;
      onSaveError('삭제 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setDeletingIds((prev) => {
        const nextIds = new Set(prev);
        nextIds.delete(id);
        return nextIds;
      });
    }
  }

  return (
    <section>
      <label htmlFor="custom-extension-input">커스텀 확장자 입력</label>
      <input
        id="custom-extension-input"
        ref={inputRef}
        maxLength={20}
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      <span>{input.length}/20</span>
      <button type="button" onClick={handleAdd} disabled={!canSubmit}>
        {isSubmitting ? '추가 중...' : '추가'}
      </button>
      {inlineError && <p role="alert">{inlineError}</p>}
      <span>{list.length}/200</span>
      <ul>
        {list.map((ext) => (
          <li key={ext.id}>
            {ext.name}
            <button
              type="button"
              id={`custom-ext-delete-${ext.id}`}
              aria-label={`${ext.name} 삭제`}
              onClick={() => handleDelete(ext.id)}
              disabled={deletingIds.has(ext.id)}
            >
              X
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
