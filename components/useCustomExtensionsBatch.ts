// components/useCustomExtensionsBatch.ts
'use client';

import { useState } from 'react';
import { parseBatchItems, splitByComma, splitByLine } from '@/lib/policy/batchParse';

interface BatchSubmitSummary {
  added: string[];
  fixedActivated: string[];
  skippedExistingCount: number;
}

function buildSummaryMessage(summary: BatchSubmitSummary): string {
  const parts: string[] = [];
  if (summary.added.length > 0) {
    parts.push(`${summary.added.length}개 등록됨`);
  }
  if (summary.fixedActivated.length > 0) {
    parts.push(`${summary.fixedActivated.join(', ')} 활성화됨`);
  }
  if (summary.skippedExistingCount > 0) {
    parts.push(`이미 등록된 ${summary.skippedExistingCount}개 제외`);
  }
  if (parts.length === 0) {
    return '반영할 변경이 없었습니다.';
  }
  return parts.join(', ');
}

export function useCustomExtensionsBatch({
  onSaveSuccess,
  onSaveError,
  onResync,
}: {
  onSaveSuccess: (message: string) => void;
  onSaveError: (message: string) => void;
  onResync: () => void | Promise<void>;
}) {
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canSubmit = input.trim().length > 0 && !isSubmitting;

  async function submitItems(items: string[]) {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await fetch('/api/policy/custom-extensions/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const body = await response.json();

      if (!response.ok) {
        if (body.error.code === 'INVALID_ITEMS') {
          setErrorMessage(`올바르지 않은 항목이 있습니다: ${body.error.invalidItems.join(', ')}`);
        } else if (body.error.code === 'LIMIT_EXCEEDED') {
          // 한도 초과는 사용자가 입력/파일을 고쳐야 하는 정책 오류이므로 인라인으로 남긴다.
          setErrorMessage(body.error.message);
        } else {
          onSaveError(body.error.message);
        }
        return;
      }

      setInput('');
      onSaveSuccess(buildSummaryMessage(body));
      // 목록 refetch가 끝날 때까지 진행 중을 유지해, 대량 반영 직후 화면이 멈춘 것처럼 보이지 않게 한다.
      await onResync();
    } catch {
      onSaveError('저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  }

  // 형식 오류는 이 함수에서 즉시 걸러 API 호출 없이 플랫 목록으로 안내한다(설계 문서 2절).
  // 통과하면 서버가 기존 커스텀 중복 제외/고정 확장자 자동 활성화/200개 제한을 최종 처리한다.
  // startedSubmit: import 경로에서 이미 isSubmitting=true인 경우, 조기 반환 시 해제해야 한다.
  function processRawItems(rawItems: string[], options?: { clearSubmittingOnReject?: boolean }) {
    const result = parseBatchItems(rawItems);

    if (!result.ok) {
      setErrorMessage(`올바르지 않은 항목이 있습니다: ${result.invalidItems.join(', ')}`);
      if (options?.clearSubmittingOnReject) setIsSubmitting(false);
      return;
    }
    if (result.items.length === 0) {
      setErrorMessage('등록할 항목이 없습니다.');
      if (options?.clearSubmittingOnReject) setIsSubmitting(false);
      return;
    }
    setErrorMessage(null);
    void submitItems(result.items);
  }

  function handleSubmitText() {
    processRawItems(splitByComma(input));
  }

  // extignore.txt import는 파일 선택 즉시 파싱/검증해 자동 제출한다(설계 문서 6절) —
  // 일괄 입력 텍스트 영역에 내용을 채워 사용자가 확인하는 중간 단계는 두지 않는다.
  function handleImportFile(file: File) {
    // FileReader와 파싱이 끝나기 전부터 진행 중을 보여준다.
    setIsSubmitting(true);
    setErrorMessage(null);

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      processRawItems(splitByLine(text), { clearSubmittingOnReject: true });
    };
    reader.onerror = () => {
      setIsSubmitting(false);
      onSaveError('파일을 읽지 못했습니다. 다시 시도해주세요.');
    };
    reader.readAsText(file);
  }

  return { input, setInput, isSubmitting, errorMessage, canSubmit, handleSubmitText, handleImportFile };
}
