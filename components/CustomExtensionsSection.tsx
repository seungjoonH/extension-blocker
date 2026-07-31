// components/CustomExtensionsSection.tsx
'use client';

import { useEffect, useRef, useState } from 'react';

interface CustomExtension {
  id: string;
  name: string;
}

const INLINE_ERROR_CODES = new Set(['INVALID_EXTENSION_FORMAT', 'DUPLICATE_EXTENSION', 'LIMIT_EXCEEDED']);
const LIMIT_REACHED_MESSAGE = '최대 200개까지 등록할 수 있습니다. 기존 항목을 삭제한 후 다시 추가해주세요.';

export function CustomExtensionsSection({
  extensions,
  onSaveSuccess,
  onSaveError,
  onResync,
}: {
  extensions: CustomExtension[];
  onSaveSuccess: (message: string) => void;
  onSaveError: (message: string) => void;
  onResync: () => void;
}) {
  const [list, setList] = useState(extensions);
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingFocusIdRef = useRef<string | null>(null);

  const trimmed = input.trim();
  const limitReached = list.length >= 200;
  const canSubmit = trimmed.length > 0 && !isSubmitting && !limitReached;

  // extensions prop이 갱신되면(다른 영역의 실패로 인한 onResync 재조회 등) 서버의 최신 값으로 다시 동기화한다.
  // 이 컴포넌트는 추가/삭제를 낙관적 로컬 상태가 아니라 서버 응답을 반영해 갱신하므로(handleAdd/handleDelete가
  // 직접 서버 요청 완료 후에만 list를 갱신함), 이 effect가 나중에 실행되어도 진행 중인 추가/삭제 결과를 덮어쓰지 않는다.
  useEffect(() => {
    setList(extensions);
  }, [extensions]);

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
        onResync();
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
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="input-row mb-3">
        <label htmlFor="custom-extension-input" className="text-sm font-medium text-gray-900 dark:text-gray-100">
          커스텀 확장자 입력
        </label>
        <input
          id="custom-extension-input"
          ref={inputRef}
          maxLength={20}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
        />
        <span className="text-xs text-gray-500 dark:text-gray-400">{input.length}/20</span>
        <button
          type="button"
          onClick={handleAdd}
          disabled={!canSubmit}
          className="inline-flex items-center justify-center rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300 dark:disabled:bg-gray-700 dark:disabled:text-gray-400"
        >
          {isSubmitting ? '추가 중...' : '추가'}
        </button>
      </div>
      {inlineError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {inlineError}
        </p>
      )}
      {limitReached && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {LIMIT_REACHED_MESSAGE}
        </p>
      )}
      <span className="text-xs text-gray-500 dark:text-gray-400">{list.length}/200</span>
      <ul className="mt-2">
        {list.map((ext) => (
          <li
            key={ext.id}
            className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          >
            {ext.name}
            <button
              type="button"
              id={`custom-ext-delete-${ext.id}`}
              aria-label={`${ext.name} 삭제`}
              onClick={() => handleDelete(ext.id)}
              disabled={deletingIds.has(ext.id)}
              className="rounded-md border border-gray-300 px-1.5 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {deletingIds.has(ext.id) ? '삭제 중...' : 'X'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
