// components/CustomExtensionList.tsx
'use client';

import { CustomExtension } from './useCustomExtensions';

export function CustomExtensionList({
  list,
  deletingIds,
  handleDelete,
}: {
  list: CustomExtension[];
  deletingIds: Set<string>;
  handleDelete: (id: string) => void;
}) {
  return (
    <div className="mt-3">
      <span className="text-xs text-gray-500 dark:text-gray-400">{list.length}/200</span>
      <ul className="mt-2 flex flex-wrap gap-2">
        {list.map((ext) => (
          <li
            key={ext.id}
            className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          >
            {ext.name}
            {/* 로딩 중에도 라벨을 바꾸지 않는다 — 칩 너비 변화로 줄바꿈이 흔들리는 것을 막기 위함. */}
            <button
              type="button"
              id={`custom-ext-delete-${ext.id}`}
              aria-label={`${ext.name} 삭제`}
              aria-busy={deletingIds.has(ext.id)}
              onClick={() => handleDelete(ext.id)}
              disabled={deletingIds.has(ext.id)}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-200 focus-visible:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700 dark:focus-visible:bg-gray-700"
            >
              x
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
