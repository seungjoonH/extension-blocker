'use client';

import { ButtonLoadingContent } from './ButtonSpinner';

export function CustomExtensionBatchInput({
  input,
  setInput,
  isSubmitting,
  canSubmit,
  handleSubmitText,
}: {
  input: string;
  setInput: (value: string) => void;
  isSubmitting: boolean;
  canSubmit: boolean;
  handleSubmitText: () => void;
}) {
  return (
    <div>
      <form
        className="space-y-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) handleSubmitText();
        }}
      >
        <label htmlFor="custom-extension-batch-input" className="block text-sm font-medium text-gray-900 dark:text-gray-100">
          일괄 입력
          <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">
            (쉼표로 구분, 예: exe,pdf,tar.gz)
          </span>
        </label>
        <textarea
          id="custom-extension-batch-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={3}
          className="block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
        />
        <button
          type="submit"
          disabled={!canSubmit}
          aria-busy={isSubmitting}
          aria-label="일괄 등록"
          className="inline-grid place-items-center rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300 dark:disabled:bg-gray-700 dark:disabled:text-gray-400"
        >
          <ButtonLoadingContent idleLabel="일괄 등록" isLoading={isSubmitting} />
        </button>
      </form>
    </div>
  );
}
