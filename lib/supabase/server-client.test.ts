import { describe, expect, it } from 'vitest';
import { createServiceRoleClient } from './server-client';

describe('createServiceRoleClient', () => {
  it('환경변수가 없으면 에러를 던진다', () => {
    const originalUrl = process.env.SUPABASE_URL;
    delete process.env.SUPABASE_URL;
    expect(() => createServiceRoleClient()).toThrow('SUPABASE_URL');
    process.env.SUPABASE_URL = originalUrl;
  });

  it('환경변수가 있으면 클라이언트를 반환한다', () => {
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    const client = createServiceRoleClient();
    expect(client).toBeDefined();
  });
});
