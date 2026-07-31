'use client';

import { useCallback, useEffect, useState } from 'react';

export interface Policy {
  fixedExtensions: { name: string; active: boolean }[];
  customExtensions: { id: string; name: string }[];
  maxUploadSizeBytes: number;
}

export function usePolicy() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/policy');
      if (!response.ok) {
        throw new Error('정책을 불러오지 못했습니다.');
      }
      setPolicy(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('알 수 없는 오류'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { policy, isLoading, error, refetch };
}
