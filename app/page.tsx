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
      <main>
        <h1>{PAGE_TITLE}</h1>
        <p role="status">불러오는 중...</p>
      </main>
    );
  }

  if (error || !policy) {
    return (
      <main>
        <h1>{PAGE_TITLE}</h1>
        <p role="alert">정책을 불러오지 못했습니다.</p>
        <button type="button" onClick={refetch}>
          다시 시도
        </button>
      </main>
    );
  }

  return (
    <main>
      <h1>{PAGE_TITLE}</h1>
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
