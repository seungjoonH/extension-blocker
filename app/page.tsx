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
  const { toasts, showSuccess, showError, dismiss } = useToast();

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
    <main className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6 lg:max-w-5xl">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{PAGE_TITLE}</h1>
      <ToastRegion toasts={toasts} onDismiss={dismiss} />

      {/* 데스크톱(lg 이상)에서는 좌우 2열, 좁은 화면에서는 세로 1열로 쌓인다.
          grid-cols-1이 항상 기본값이므로 가로 스크롤 없이 자연스럽게 세로 배치된다. */}
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
