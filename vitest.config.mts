import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    passWithNoTests: true,
    // 통합 테스트 대부분이 격리 없이 같은 로컬 Postgres(extension_policy, upload_settings 등)를
    // 직접 읽고 쓴다. 파일을 병렬 실행하면 한 파일의 beforeEach 정리가 다른 파일의
    // 삽입과 검증 사이에 끼어들어 교차 오염을 일으킨다(Task 10에서 실제로 재현됨).
    fileParallelism: false,
  },
  resolve: {
    alias: { '@': import.meta.dirname },
  },
});
