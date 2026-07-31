'use client';

import { usePolicy } from '@/components/usePolicy';
import { useToast } from '@/components/useToast';
import { ToastRegion } from '@/components/ToastRegion';
import { FixedExtensionsSection } from '@/components/FixedExtensionsSection';
import { CustomExtensionsSection } from '@/components/CustomExtensionsSection';
import { UploadSizeSection } from '@/components/UploadSizeSection';
import { FileUploadSection } from '@/components/FileUploadSection';

const PAGE_TITLE = '확장자 차단 및 업로드 관리';

export default function Page() {
  const { policy, isLoading, error, refetch } = usePolicy();
  const { toast, showSuccess, showError, dismiss } = useToast();

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
  // 아래 다섯 섹션 렌더링에서 policy를 안전하게 사용하기 위한 것이다.
  if (!policy) {
    return null;
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{PAGE_TITLE}</h1>
      <ToastRegion toast={toast} onDismiss={dismiss} />
      <FixedExtensionsSection
        extensions={policy.fixedExtensions}
        onSaveSuccess={showSuccess}
        onSaveError={showError}
        onResync={refetch}
      />
      <CustomExtensionsSection
        extensions={policy.customExtensions}
        onSaveSuccess={showSuccess}
        onSaveError={showError}
        onResync={refetch}
      />
      <UploadSizeSection
        maxUploadSizeBytes={policy.maxUploadSizeBytes}
        onSaveSuccess={showSuccess}
        onSaveError={showError}
      />
      <FileUploadSection />
    </main>
  );
}
