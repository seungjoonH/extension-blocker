'use client';

const MODES = [
  { value: 'single', label: '단일 입력' },
  { value: 'batch', label: '일괄 입력' },
] as const;

export function CustomExtensionModeToggle({
  mode,
  onModeChange,
}: {
  mode: 'single' | 'batch';
  onModeChange: (mode: 'single' | 'batch') => void;
}) {
  return (
    <div role="radiogroup" aria-label="커스텀 확장자 입력 방식" className="inline-flex rounded-md border border-gray-300 dark:border-gray-700">
      {MODES.map((option, index) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={mode === option.value}
          onClick={() => onModeChange(option.value)}
          className={`px-3 py-1.5 text-sm font-medium ${index === 0 ? 'rounded-l-md' : 'rounded-r-md'} ${
            mode === option.value
              ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
              : 'bg-white text-gray-700 hover:bg-gray-100 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-800'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
