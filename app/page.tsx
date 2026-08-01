'use client';

import { useState } from 'react';
import { Policy, usePolicy } from '@/components/usePolicy';
import { useToast } from '@/components/useToast';
import { ToastRegion } from '@/components/ToastRegion';
import { FixedExtensionsSection } from '@/components/FixedExtensionsSection';
import { useCustomExtensions } from '@/components/useCustomExtensions';
import { CustomExtensionInput } from '@/components/CustomExtensionInput';
import { CustomExtensionList } from '@/components/CustomExtensionList';
import { UploadSizeSection } from '@/components/UploadSizeSection';
import { FileUploadSection } from '@/components/FileUploadSection';
import { useCustomExtensionsBatch } from '@/components/useCustomExtensionsBatch';
import { CustomExtensionModeToggle } from '@/components/CustomExtensionModeToggle';
import { CustomExtensionBatchInput } from '@/components/CustomExtensionBatchInput';
import { ExtignoreControls } from '@/components/ExtignoreControls';
import { ResetPolicyButton } from '@/components/ResetPolicyButton';

const PAGE_TITLE = '확장자 차단 및 업로드 관리';

// policy?.customExtensions ?? [] 형태로 매 렌더링마다 새 배열을 만들면, 정책 로딩 중에는
// useCustomExtensions 내부의 useEffect(() => setList(extensions), [extensions])가 매 렌더링마다
// "값은 같지만 참조가 다른" 배열을 새 의존성으로 인식해 재실행되고, 이것이 다시 렌더링을 유발해
// 무한 루프에 빠진다. 로딩 중 기본값으로 항상 같은 배열 참조를 재사용해 이를 방지한다.
const EMPTY_CUSTOM_EXTENSIONS: Policy['customExtensions'] = [];

export default function Page() {
  const { policy, isLoading, error, refetch } = usePolicy();
  const { toasts, showSuccess, showError, dismiss } = useToast();
  // 정책 로딩 전에도 훅 호출 순서를 일정하게 유지하기 위해 이른 반환(return) 이전에 호출한다.
  const customExtensions = useCustomExtensions({
    extensions: policy?.customExtensions ?? EMPTY_CUSTOM_EXTENSIONS,
    onSaveSuccess: showSuccess,
    onSaveError: showError,
    onResync: refetch,
  });

  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [fixedExtensionsPending, setFixedExtensionsPending] = useState(false);
  const customExtensionsBatch = useCustomExtensionsBatch({
    onSaveSuccess: showSuccess,
    onSaveError: showError,
    onResync: refetch,
  });

  const isAnySectionPending =
    fixedExtensionsPending ||
    customExtensions.isSubmitting ||
    customExtensions.deletingIds.size > 0 ||
    customExtensionsBatch.isSubmitting;

  function handleModeChange(nextMode: 'single' | 'batch') {
    customExtensions.setInput('');
    customExtensionsBatch.setInput('');
    setMode(nextMode);
  }

  if (isLoading) {
    return (
      <main className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{PAGE_TITLE}</h1>
        <p role="status" className="text-sm text-gray-500 dark:text-gray-400">
          불러오는 중...
        </p>
      </main>
    );
  }

  if (error && !policy) {
    return (
      <main className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{PAGE_TITLE}</h1>
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          정책을 불러오지 못했습니다.
        </p>
        <button
          type="button"
          onClick={refetch}
          className="inline-flex items-center justify-center rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
        >
          다시 시도
        </button>
      </main>
    );
  }

  // isLoading이 false인 시점에는 위 두 분기(error && !policy, isLoading)를 거치지 않는 한
  // policy가 항상 채워져 있다. 이 반환문은 도달하지 않지만 policy를 타입상 non-null로 좁혀
  // 아래 영역 렌더링에서 policy를 안전하게 사용하기 위한 것이다.
  if (!policy) {
    return null;
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6 lg:max-w-5xl">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{PAGE_TITLE}</h1>
      <ToastRegion toasts={toasts} onDismiss={dismiss} />

      {/* 데스크톱(lg 이상): 왼쪽 확장자 정책 / 오른쪽 파일 업로드.
          각 열의 섹션 제목·설명은 카드 밖 동일 레벨. 확장자 소제목은 카드 안. */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section aria-labelledby="extension-policy-heading" className="min-w-0 space-y-4">
          <div>
            <h2 id="extension-policy-heading" className="text-base font-semibold text-gray-900 dark:text-gray-100">
              확장자 정책
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              업로드를 차단할 확장자와 허용할 최대 파일 크기를 설정합니다.
            </p>
          </div>

          <UploadSizeSection
            maxUploadSizeBytes={policy.maxUploadSizeBytes}
            onSaveSuccess={showSuccess}
            onSaveError={showError}
          />

          <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">확장자</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                업로드를 차단할 커스텀 확장자와 고정 확장자를 설정합니다.
              </p>
            </div>
            <CustomExtensionModeToggle mode={mode} onModeChange={handleModeChange} />
            {mode === 'single' ? (
              <CustomExtensionInput {...customExtensions} />
            ) : (
              <CustomExtensionBatchInput {...customExtensionsBatch} />
            )}
            <ExtignoreControls
              policy={policy}
              onImportFile={customExtensionsBatch.handleImportFile}
              isSubmitting={customExtensionsBatch.isSubmitting}
            />
            <FixedExtensionsSection
              extensions={policy.fixedExtensions}
              onSaveSuccess={showSuccess}
              onSaveError={showError}
              onResync={refetch}
              onPendingChange={setFixedExtensionsPending}
            />
            <CustomExtensionList {...customExtensions} />
            <ResetPolicyButton
              disabled={isAnySectionPending}
              onSaveSuccess={showSuccess}
              onSaveError={showError}
              onResync={refetch}
            />
          </div>
        </section>

        <section aria-labelledby="file-upload-heading" className="min-w-0 space-y-4">
          <div>
            <h2 id="file-upload-heading" className="text-base font-semibold text-gray-900 dark:text-gray-100">
              파일 업로드
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">파일을 선택해 업로드합니다.</p>
          </div>
          <FileUploadSection />
        </section>
      </div>
    </main>
  );
}
