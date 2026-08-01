// components/CustomExtensionInput.tsx
'use client';

import { RefObject } from 'react';
import { LIMIT_REACHED_MESSAGE } from './useCustomExtensions';
import { ButtonLoadingContent } from './ButtonSpinner';

export function CustomExtensionInput({
  input,
  setInput,
  isSubmitting,
  inlineError,
  liveFormatError,
  inputRef,
  limitReached,
  canSubmit,
  handleAdd,
}: {
  input: string;
  setInput: (value: string) => void;
  isSubmitting: boolean;
  inlineError: string | null;
  liveFormatError: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  limitReached: boolean;
  canSubmit: boolean;
  handleAdd: () => void;
}) {
  // 입력 중 즉시 알 수 있는 형식 오류(liveFormatError)를 가장 먼저 보여주고,
  // 그렇지 않으면 지난 제출에서 받은 서버 오류(inlineError)를, 그것도 없으면 정원 초과 안내를 보여준다.
  const message = liveFormatError ?? inlineError ?? (limitReached ? LIMIT_REACHED_MESSAGE : null);

  return (
    <div>
      <form
        className="input-row mb-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) handleAdd();
        }}
      >
        <label htmlFor="custom-extension-input" className="text-sm font-medium text-gray-900 dark:text-gray-100">
          커스텀 확장자 입력
        </label>
        <input
          id="custom-extension-input"
          ref={inputRef}
          maxLength={20}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
        />
        <span className="text-xs text-gray-500 dark:text-gray-400">{input.length}/20</span>
        <button
          type="submit"
          disabled={!canSubmit}
          aria-busy={isSubmitting}
          aria-label="추가"
          className="inline-grid place-items-center rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300 dark:disabled:bg-gray-700 dark:disabled:text-gray-400"
        >
          <ButtonLoadingContent idleLabel="추가" isLoading={isSubmitting} />
        </button>
      </form>
      {/* 오류 문구가 나타나거나 사라질 때 아래 요소가 밀리지 않도록 한 줄 높이를 예약한다. */}
      <div className="min-h-5">{message && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{message}</p>}</div>
    </div>
  );
}
