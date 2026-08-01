'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatFileSizeMb } from '@/lib/format/fileSize';
import { ButtonLoadingContent } from './ButtonSpinner';

export interface UploadedFileItem {
  id: string;
  originalFilename: string;
  fileSizeBytes: number;
  createdAt: string;
  isProtected: boolean;
}

function formatUploadedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function UploadedFilesList({ refreshKey = 0 }: { refreshKey?: number }) {
  const [items, setItems] = useState<UploadedFileItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch('/api/uploads');
      const body = await response.json();
      if (!response.ok) {
        setErrorMessage(body.error?.message ?? '목록을 불러오지 못했습니다.');
        return;
      }
      setItems(body.items ?? []);
    } catch {
      setErrorMessage('목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function handleDelete(item: UploadedFileItem) {
    if (item.isProtected) return;
    const confirmed = window.confirm(`"${item.originalFilename}" 파일을 삭제할까요?`);
    if (!confirmed) return;

    setDeletingIds((prev) => new Set(prev).add(item.id));
    try {
      const response = await fetch(`/api/uploads/${item.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setErrorMessage(body?.error?.message ?? '삭제에 실패했습니다.');
        return;
      }
      await load();
    } catch {
      setErrorMessage('삭제에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }

  return (
    <section aria-labelledby="uploaded-files-heading" className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div>
        <h3 id="uploaded-files-heading" className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          업로드된 파일
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">저장된 파일을 다운로드하거나 삭제할 수 있습니다.</p>
      </div>

      {isLoading && <p className="text-sm text-gray-500 dark:text-gray-400">불러오는 중...</p>}
      {errorMessage && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {errorMessage}
        </p>
      )}

      {!isLoading && items.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">업로드된 파일이 없습니다.</p>
      )}

      {!isLoading && items.length > 0 && (
        <ul className="!flex !w-full !flex-col !flex-nowrap !gap-0 divide-y divide-gray-100 dark:divide-gray-800">
          {items.map((item) => {
            const deleting = deletingIds.has(item.id);
            return (
              <li key={item.id} className="!flex !w-full !min-w-0 items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-gray-900 dark:text-gray-100">{item.originalFilename}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatFileSizeMb(item.fileSizeBytes)} · {formatUploadedAt(item.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <a
                    href={`/api/uploads/${item.id}/download`}
                    className="inline-flex items-center justify-center rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    다운로드
                  </a>
                  <button
                    type="button"
                    onClick={() => void handleDelete(item)}
                    disabled={item.isProtected || deleting}
                    aria-busy={deleting}
                    aria-label="삭제"
                    className="inline-grid place-items-center rounded border border-red-300 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950 dark:disabled:border-gray-800 dark:disabled:text-gray-600"
                  >
                    <ButtonLoadingContent idleLabel="삭제" isLoading={deleting} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
