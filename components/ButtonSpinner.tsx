/** 버튼 내부용 원형 로딩 표시. currentColor를 따르므로 부모 글자색과 맞춘다. */
export function ButtonSpinner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`size-3.5 animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path
        d="M21 12a9 9 0 00-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 유휴 라벨 너비를 유지한 채, 진행 중에는 중앙에 스피너만 보여준다.
 *  접근성 이름은 버튼의 aria-label(또는 유휴 시 보이는 텍스트)로 유지한다. */
export function ButtonLoadingContent({
  idleLabel,
  isLoading,
}: {
  idleLabel: string;
  isLoading: boolean;
}) {
  return (
    <>
      <span className={`col-start-1 row-start-1 ${isLoading ? 'invisible' : ''}`} aria-hidden="true">
        {idleLabel}
      </span>
      {isLoading && (
        <span className="col-start-1 row-start-1 inline-flex items-center justify-center">
          <ButtonSpinner />
        </span>
      )}
    </>
  );
}
