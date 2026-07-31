# File Extension Blocker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 확장자 차단 정책(고정 7종 + 커스텀 최대 200개)을 관리하고, 실제 파일 업로드에 그 정책과 ClamAV 검사를 강제하는 단일 화면 애플리케이션을 구현한다.

**Architecture:** Next.js App Router 단일 컨테이너에서 정적 화면(`page.tsx`)과 Route Handler(`app/api/*`)를 함께 실행한다. Route Handler는 Supabase Postgres(정책/메타데이터)와 Supabase Storage(파일)에 service role key로 접근하고, 같은 컨테이너의 `clamd`에 TCP로 연결해 업로드 파일을 검사한다. 데이터 모델, API 계약, 검증 순서, 동시성 처리는 `docs/specs/DESIGN.md`에 확정되어 있고 이 계획은 그 설계를 코드로 옮기는 순서를 정의한다.

**Tech Stack:** Next.js(App Router, TypeScript), `@supabase/supabase-js`, `clamscan`(NodeClam), Vitest(+ `@testing-library/react`, `jsdom`), Supabase CLI 로컬 스택(Postgres/Storage 통합 테스트용).

## Global Constraints

이 값들은 모든 태스크에 암묵적으로 적용된다. 정확한 값은 `docs/specs/REQUIREMENTS.md`, `docs/specs/PLANNING.md`, `docs/specs/DESIGN.md`에서 그대로 가져왔다.

- 고정 확장자 7종: `bat`, `cmd`, `com`, `cpl`, `exe`, `scr`, `js` (기본 `active=false`)
- 커스텀 확장자: 최대 20자, 최대 200개, 영문 소문자/숫자/내부 마침표만 허용, 연속/선행/후행 마침표 금지
- 원본 파일명 길이 제한: 255바이트(UTF-8, `TextEncoder`로 계산)
- 업로드 크기 선택지: `1MB`, `5MB`, `10MB`, `20MB`, `50MB`(1048576/5242880/10485760/20971520/52428800바이트), 기본값 10MB
- 저장 파일명은 UUID v4, 원본 확장자를 붙이지 않는다
- API 오류 응답은 항상 `{ "error": { "code": string, "message": string } }` 형식
- Supabase 자격 증명(service role key)은 서버 코드에서만 사용하고 클라이언트에 노출하지 않는다
- ClamAV는 `clamscan`(NodeClam) 패키지의 `scanStream()`/`ping()`만 사용한다(`scanBuffer()`는 존재하지 않는다)
- ClamAV 타임아웃은 환경변수 `CLAMAV_TIMEOUT_MS` 하나로 관리(`clamdscan.timeout`에 매핑)
- 로그 실패 유형 10종: `INVALID_UPLOAD_REQUEST`(`FILE_REQUIRED`/`MULTIPLE_FILES_NOT_ALLOWED`/`INVALID_MULTIPART_REQUEST`), `REQUEST_TOO_LARGE`, `INVALID_FILENAME`(`EMPTY_FILENAME`/`FILENAME_TOO_LONG`), `BLOCKED_EXTENSION`, `FILE_SIZE_EXCEEDED`, `CLAMAV_MALWARE_DETECTED`, `CLAMAV_UNAVAILABLE`, `STORAGE_SAVE_FAILED`, `METADATA_SAVE_FAILED`, `INTERNAL_ERROR`
- 로그에 원본 파일 내용, Storage 객체 키, 내부 경로는 절대 기록하지 않는다

---

## File Structure

```
app/
  layout.tsx
  page.tsx                                       화면 컴포지션(5개 섹션)
  api/
    policy/route.ts                               GET  /api/policy
    policy/fixed-extensions/[name]/route.ts        PATCH /api/policy/fixed-extensions/{name}
    policy/custom-extensions/route.ts              POST /api/policy/custom-extensions
    policy/custom-extensions/[id]/route.ts         DELETE /api/policy/custom-extensions/{id}
    policy/upload-size/route.ts                    PUT  /api/policy/upload-size
    uploads/route.ts                               POST /api/uploads
    health/route.ts                                GET  /api/health

lib/
  supabase/server-client.ts                        service role client 생성
  policy/normalize.ts                              normalizeExtensionInput
  policy/match.ts                                  isExtensionBlocked
  policy/filename.ts                                validateFilename
  policy/errors.ts                                  ApiError, 코드 상수
  clamav/client.ts                                  scanFile, pingClamAv
  logging/logger.ts                                 logUploadResult
  upload/pipeline.ts                                업로드 검증/저장 파이프라인

components/
  usePolicy.ts                                      정책 조회/저장 훅
  FixedExtensionsSection.tsx
  CustomExtensionsSection.tsx
  UploadSizeSection.tsx
  FileUploadSection.tsx
  ToastRegion.tsx
  useToast.ts

supabase/
  migrations/
    0001_extension_policy.sql
    0002_upload_settings.sql
    0003_uploads.sql
    0004_add_custom_extension_rpc.sql
```

각 파일은 `docs/specs/DESIGN.md`의 대응 절 하나에 대응한다(3.1~3.4 → 마이그레이션, 4.1~4.4 → `app/api/*`, 5.2 → RPC, 5.4 → `lib/clamav`, 5.5 → `lib/logging`).

---

### Task 1: 프로젝트 스캐폴딩과 테스트 도구 구성

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.env.example`
- Create: `app/layout.tsx`, `app/page.tsx`(placeholder)

**Interfaces:**
- Consumes: 없음(최초 태스크)
- Produces: `npm test`, `npm run dev`, `npm run build` 스크립트. 이후 모든 태스크는 이 스크립트로 검증한다.

- [ ] **Step 1: Next.js 앱 생성**

```bash
npx create-next-app@latest . --typescript --app --eslint --no-tailwind --src-dir=false --import-alias "@/*"
```

- [ ] **Step 2: 테스트 의존성 설치**

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
npm install @supabase/supabase-js clamscan
```

- [ ] **Step 3: `vitest.config.ts` 작성**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
```

```ts
// vitest.setup.ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: `package.json`에 스크립트 추가**

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 5: `.env.example` 작성**

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=uploads
CLAMAV_HOST=127.0.0.1
CLAMAV_PORT=3310
CLAMAV_TIMEOUT_MS=30000
SERVER_MAX_REQUEST_BYTES=58720256
```

- [ ] **Step 6: 빌드와 테스트 러너가 동작하는지 확인**

Run: `npm run build && npm test`
Expected: 빌드 성공, 테스트 0건 통과(아직 테스트 파일 없음)로 종료

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: Next.js 프로젝트와 테스트 도구 초기화"
```

---

### Task 2: Supabase 로컬 스택과 서버 클라이언트

**Files:**
- Create: `supabase/config.toml`(CLI가 생성), `lib/supabase/server-client.ts`
- Test: `lib/supabase/server-client.test.ts`

**Interfaces:**
- Consumes: `.env.example`(Task 1)
- Produces: `createServiceRoleClient(): SupabaseClient` — 이후 모든 DB 접근 코드가 이 함수를 사용한다.

- [ ] **Step 1: Supabase CLI 로컬 스택 초기화**

```bash
npx supabase init
npx supabase start
```

Run 후 출력되는 `API URL`, `service_role key`를 `.env.test`에 기록한다(`.env.test`는 `.gitignore`에 추가).

- [ ] **Step 2: 실패하는 테스트 작성**

```ts
// lib/supabase/server-client.test.ts
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- server-client`
Expected: FAIL, `Cannot find module './server-client'`

- [ ] **Step 3: 구현**

```ts
// lib/supabase/server-client.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function createServiceRoleClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- server-client`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: Supabase 로컬 스택과 서버 전용 클라이언트 추가"
```

---

### Task 3: `extension_policy` 마이그레이션

**Files:**
- Create: `supabase/migrations/0001_extension_policy.sql`
- Test: `supabase/migrations/0001_extension_policy.test.ts`

**Interfaces:**
- Consumes: `createServiceRoleClient()`(Task 2)
- Produces: `extension_policy` 테이블. 이후 모든 확장자 관련 코드가 이 테이블을 사용한다.

- [ ] **Step 1: 실패하는 테스트 작성**(마이그레이션 미적용 상태에서 실행)

```ts
// supabase/migrations/0001_extension_policy.test.ts
import { describe, expect, it } from 'vitest';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

describe('extension_policy 마이그레이션', () => {
  const supabase = createServiceRoleClient();

  it('시드된 7개 고정 확장자가 모두 비활성 상태다', async () => {
    const { data, error } = await supabase
      .from('extension_policy')
      .select('name, kind, active')
      .eq('kind', 'fixed')
      .order('name');

    expect(error).toBeNull();
    expect(data).toHaveLength(7);
    expect(data?.every((row) => row.active === false)).toBe(true);
  });

  it('커스텀 확장자는 active=false로 저장할 수 없다', async () => {
    const { error } = await supabase
      .from('extension_policy')
      .insert({ name: 'zzz-test', kind: 'custom', active: false });

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/extension_policy_custom_always_active/);
  });

  it('같은 name을 두 번 등록할 수 없다', async () => {
    await supabase.from('extension_policy').insert({ name: 'dup-test', kind: 'custom' });
    const { error } = await supabase
      .from('extension_policy')
      .insert({ name: 'dup-test', kind: 'custom' });

    expect(error?.message).toMatch(/extension_policy_name_key/);
    await supabase.from('extension_policy').delete().eq('name', 'dup-test');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- 0001_extension_policy`
Expected: FAIL, `relation "extension_policy" does not exist`

- [ ] **Step 3: 마이그레이션 작성**(`docs/specs/DESIGN.md` 3.1절 그대로)

```sql
-- supabase/migrations/0001_extension_policy.sql
create table extension_policy (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kind        text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),

  constraint extension_policy_name_key unique (name),
  constraint extension_policy_kind_check check (kind in ('fixed', 'custom')),
  constraint extension_policy_custom_always_active check (kind = 'fixed' or active = true)
);

insert into extension_policy (name, kind, active) values
  ('bat','fixed',false), ('cmd','fixed',false), ('com','fixed',false),
  ('cpl','fixed',false), ('exe','fixed',false), ('scr','fixed',false), ('js','fixed',false);

grant select, insert, update, delete on extension_policy to service_role;
```

Supabase 기본 권한 설정은 마이그레이션(`postgres` 역할)이 생성한 테이블에 `service_role`을 자동으로 포함하지 않는다. `grant` 없이 `service_role` 클라이언트로 조회하면 Postgres `42501 permission denied for table extension_policy` 오류가 발생한다.

- [ ] **Step 4: 마이그레이션 적용과 테스트 통과 확인**

Run: `npx supabase migration up && npm test -- 0001_extension_policy`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: extension_policy 테이블 마이그레이션 추가"
```

---

### Task 4: `upload_settings` 마이그레이션

**Files:**
- Create: `supabase/migrations/0002_upload_settings.sql`
- Test: `supabase/migrations/0002_upload_settings.test.ts`

**Interfaces:**
- Consumes: `createServiceRoleClient()`(Task 2)
- Produces: `upload_settings` 테이블(단일 행, id=1)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// supabase/migrations/0002_upload_settings.test.ts
import { describe, expect, it } from 'vitest';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

describe('upload_settings 마이그레이션', () => {
  const supabase = createServiceRoleClient();

  it('기본값은 10MB(10485760바이트)다', async () => {
    const { data, error } = await supabase
      .from('upload_settings')
      .select('max_upload_size_bytes')
      .eq('id', 1)
      .single();

    expect(error).toBeNull();
    expect(data?.max_upload_size_bytes).toBe(10485760);
  });

  it('허용되지 않은 값은 저장할 수 없다', async () => {
    const { error } = await supabase
      .from('upload_settings')
      .update({ max_upload_size_bytes: 999 })
      .eq('id', 1);

    expect(error?.message).toMatch(/upload_settings_max_upload_size_bytes_check/);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- 0002_upload_settings`
Expected: FAIL, `relation "upload_settings" does not exist`

- [ ] **Step 3: 마이그레이션 작성**

```sql
-- supabase/migrations/0002_upload_settings.sql
create table upload_settings (
  id                    smallint primary key default 1 check (id = 1),
  max_upload_size_bytes integer not null check (
    max_upload_size_bytes in (1048576, 5242880, 10485760, 20971520, 52428800)
  ),
  updated_at            timestamptz not null default now()
);

insert into upload_settings (id, max_upload_size_bytes) values (1, 10485760);

grant select, update on upload_settings to service_role;
```

Task 3와 동일한 이유로 `grant`가 필요하다(Supabase 기본 권한은 마이그레이션이 생성한 테이블에 `service_role`을 자동으로 포함하지 않는다). 이 테이블은 삽입/삭제가 없으므로 `select`, `update`만 부여한다.

- [ ] **Step 4: 마이그레이션 적용과 테스트 통과 확인**

Run: `npx supabase migration up && npm test -- 0002_upload_settings`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: upload_settings 테이블 마이그레이션 추가"
```

---

### Task 5: `uploads` 마이그레이션

**Files:**
- Create: `supabase/migrations/0003_uploads.sql`
- Test: `supabase/migrations/0003_uploads.test.ts`

**Interfaces:**
- Consumes: `createServiceRoleClient()`(Task 2)
- Produces: `uploads` 테이블

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// supabase/migrations/0003_uploads.test.ts
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

describe('uploads 마이그레이션', () => {
  const supabase = createServiceRoleClient();

  it('정상 메타데이터를 저장할 수 있다', async () => {
    const id = randomUUID();
    const { error } = await supabase.from('uploads').insert({
      id,
      original_filename: 'report.pdf',
      normalized_extension: 'pdf',
      declared_mime_type: 'application/pdf',
      file_size_bytes: 1024,
    });

    expect(error).toBeNull();
    await supabase.from('uploads').delete().eq('id', id);
  });

  it('file_size_bytes가 음수면 거부한다', async () => {
    const { error } = await supabase.from('uploads').insert({
      id: randomUUID(),
      original_filename: 'x.txt',
      file_size_bytes: -1,
    });

    expect(error?.message).toMatch(/uploads_file_size_bytes_non_negative/);
  });

  it('declared_mime_type이 255자를 넘으면 거부한다', async () => {
    const { error } = await supabase.from('uploads').insert({
      id: randomUUID(),
      original_filename: 'x.txt',
      file_size_bytes: 1,
      declared_mime_type: 'a'.repeat(256),
    });

    expect(error?.message).toMatch(/uploads_declared_mime_type_length/);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- 0003_uploads`
Expected: FAIL, `relation "uploads" does not exist`

- [ ] **Step 3: 마이그레이션 작성**

```sql
-- supabase/migrations/0003_uploads.sql
create table uploads (
  id                    uuid primary key default gen_random_uuid(),
  original_filename     text not null,
  normalized_extension  text,
  declared_mime_type    text,
  file_size_bytes       bigint not null,
  created_at            timestamptz not null default now(),

  constraint uploads_declared_mime_type_length check (
    declared_mime_type is null or char_length(declared_mime_type) <= 255
  ),
  constraint uploads_file_size_bytes_non_negative check (file_size_bytes >= 0)
);

grant insert, delete on uploads to service_role;
```

Task 3와 동일한 이유로 `grant`가 필요하다. 프로덕션 코드는 `insert`만 사용하지만, 위 테스트가 생성한 행을 정리하려면 `delete`도 필요하다.

- [ ] **Step 4: 마이그레이션 적용과 테스트 통과 확인**

Run: `npx supabase migration up && npm test -- 0003_uploads`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: uploads 테이블 마이그레이션 추가"
```

---

### Task 6: `add_custom_extension` RPC

**Files:**
- Create: `supabase/migrations/0004_add_custom_extension_rpc.sql`
- Test: `supabase/migrations/0004_add_custom_extension_rpc.test.ts`

**Interfaces:**
- Consumes: `extension_policy` 테이블(Task 3)
- Produces: Postgres 함수 `add_custom_extension(p_name text) returns add_custom_extension_result`. 이후 커스텀 확장자 추가 API(Task 12)가 `supabase.rpc('add_custom_extension', { p_name })`로 호출한다. 반환 필드: `result`(`'custom_created' | 'fixed_auto_activated' | 'fixed_already_active'`), `id`, `name`, `active`.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// supabase/migrations/0004_add_custom_extension_rpc.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

describe('add_custom_extension RPC', () => {
  const supabase = createServiceRoleClient();

  beforeEach(async () => {
    await supabase.from('extension_policy').delete().eq('kind', 'custom');
    await supabase.from('extension_policy').update({ active: false }).eq('kind', 'fixed');
  });

  it('새 커스텀 확장자를 등록한다', async () => {
    const { data, error } = await supabase.rpc('add_custom_extension', { p_name: 'sh' });
    expect(error).toBeNull();
    expect(data.result).toBe('custom_created');
    expect(data.name).toBe('sh');
  });

  it('비활성 고정 확장자 이름을 등록하면 자동 활성화한다', async () => {
    const { data, error } = await supabase.rpc('add_custom_extension', { p_name: 'exe' });
    expect(error).toBeNull();
    expect(data.result).toBe('fixed_auto_activated');
    expect(data.active).toBe(true);
  });

  it('이미 활성 상태인 고정 확장자는 already_active를 반환한다', async () => {
    await supabase.from('extension_policy').update({ active: true }).eq('name', 'exe');
    const { data } = await supabase.rpc('add_custom_extension', { p_name: 'exe' });
    expect(data.result).toBe('fixed_already_active');
  });

  it('이미 등록된 커스텀 확장자는 DUPLICATE_EXTENSION 예외를 던진다', async () => {
    await supabase.rpc('add_custom_extension', { p_name: 'sh' });
    const { error } = await supabase.rpc('add_custom_extension', { p_name: 'sh' });
    expect(error?.message).toMatch(/DUPLICATE_EXTENSION/);
  });

  it('형식이 잘못된 이름은 INVALID_EXTENSION_NAME 예외를 던진다', async () => {
    const { error } = await supabase.rpc('add_custom_extension', { p_name: 'MY EXT' });
    expect(error?.message).toMatch(/INVALID_EXTENSION_NAME/);
  });

  it('동시에 같은 이름을 추가하면 하나만 성공한다', async () => {
    const results = await Promise.allSettled([
      supabase.rpc('add_custom_extension', { p_name: 'race' }),
      supabase.rpc('add_custom_extension', { p_name: 'race' }),
    ]);

    const outcomes = results.map((r) => (r.status === 'fulfilled' ? r.value : null));
    const successes = outcomes.filter((r) => r && !r.error);
    const duplicates = outcomes.filter((r) => r?.error?.message?.includes('DUPLICATE_EXTENSION'));

    expect(successes).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
  });

  it('전역 잠금이 서로 다른 이름의 동시 요청에서도 200개 제한을 정확히 지킨다', async () => {
    // 199개를 미리 채워 200개 경계 바로 앞 상태를 만든다(RPC 대신 직접 insert로 빠르게 시드)
    const seedRows = Array.from({ length: 199 }, (_, i) => ({
      name: `seed${i}`,
      kind: 'custom' as const,
      active: true,
    }));
    await supabase.from('extension_policy').insert(seedRows);

    // 서로 다른 이름 5개를 동시에 추가 시도 — 이름이 겹치지 않으므로
    // 잠금이 이름별이 아니라 테이블 전체에 걸린 전역 잠금이어야만 200개를 넘기지 않는다
    const raceNames = ['racea', 'raceb', 'racec', 'raced', 'racee'];
    await Promise.allSettled(
      raceNames.map((name) => supabase.rpc('add_custom_extension', { p_name: name })),
    );

    const { count } = await supabase
      .from('extension_policy')
      .select('*', { count: 'exact', head: true })
      .eq('kind', 'custom');

    expect(count).toBe(200);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- 0004_add_custom_extension_rpc`
Expected: FAIL, `function add_custom_extension(unknown) does not exist`

- [ ] **Step 3: 마이그레이션 작성**(`docs/specs/DESIGN.md` 5.2절 그대로)

```sql
-- supabase/migrations/0004_add_custom_extension_rpc.sql
create type add_custom_extension_result as (
  result  text,
  id      uuid,
  name    text,
  active  boolean
);

create or replace function add_custom_extension(p_name text)
returns add_custom_extension_result
language plpgsql
as $$
declare
  v_existing extension_policy;
  v_new      extension_policy;
begin
  if p_name is null
     or p_name <> lower(p_name)
     or char_length(p_name) < 1
     or char_length(p_name) > 20
     or p_name !~ '^[a-z0-9]+(\.[a-z0-9]+)*$'
  then
    raise exception using errcode = 'P0001', message = 'INVALID_EXTENSION_NAME';
  end if;

  perform pg_advisory_xact_lock(hashtext('extension_policy_custom_add'));

  select * into v_existing from extension_policy where name = p_name;

  if found then
    if v_existing.kind = 'fixed' then
      update extension_policy
      set active = true
      where id = v_existing.id and active = false
      returning * into v_existing;

      if found then
        return row('fixed_auto_activated', v_existing.id, v_existing.name, v_existing.active)::add_custom_extension_result;
      end if;

      select * into v_existing from extension_policy where name = p_name;
      return row('fixed_already_active', v_existing.id, v_existing.name, v_existing.active)::add_custom_extension_result;
    else
      raise exception using errcode = 'P0001', message = 'DUPLICATE_EXTENSION';
    end if;
  end if;

  if (select count(*) from extension_policy where kind = 'custom') >= 200 then
    raise exception using errcode = 'P0001', message = 'CUSTOM_EXTENSION_LIMIT_EXCEEDED';
  end if;

  insert into extension_policy (name, kind, active)
  values (p_name, 'custom', true)
  returning * into v_new;

  return row('custom_created', v_new.id, v_new.name, v_new.active)::add_custom_extension_result;
end;
$$;

revoke execute on function add_custom_extension(text) from public, anon, authenticated;
grant execute on function add_custom_extension(text) to service_role;
```

이 함수는 `SECURITY DEFINER`를 지정하지 않아 호출자(`service_role`)의 권한으로 실행된다. 함수 내부의 조회/갱신/삽입은 Task 3에서 `extension_policy`에 부여한 `grant`(`select, insert, update, delete`)에 의존한다. 별도의 테이블 grant를 추가할 필요는 없다.

- [ ] **Step 4: 마이그레이션 적용과 테스트 통과 확인**

Run: `npx supabase migration up && npm test -- 0004_add_custom_extension_rpc`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add_custom_extension RPC로 커스텀 확장자 추가 원자성 확보"
```

---

### Task 7: 확장자 입력 정규화

**Files:**
- Create: `lib/policy/normalize.ts`
- Test: `lib/policy/normalize.test.ts`

**Interfaces:**
- Consumes: 없음(순수 함수)
- Produces: `normalizeExtensionInput(raw: string): { ok: true; value: string } | { ok: false; reason: 'EMPTY' | 'TOO_LONG' | 'INVALID_CHARACTERS' }`. Task 12(커스텀 확장자 API)가 이 함수로 클라이언트 입력을 정규화한 뒤 RPC에 전달한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// lib/policy/normalize.test.ts
import { describe, expect, it } from 'vitest';
import { normalizeExtensionInput } from './normalize';

describe('normalizeExtensionInput', () => {
  it('앞뒤 공백을 제거한다', () => {
    expect(normalizeExtensionInput('  sh  ')).toEqual({ ok: true, value: 'sh' });
  });

  it('맨 앞 마침표 하나를 제거한다', () => {
    expect(normalizeExtensionInput('.EXE')).toEqual({ ok: true, value: 'exe' });
  });

  it('대문자를 소문자로 변환한다', () => {
    expect(normalizeExtensionInput('TAR.GZ')).toEqual({ ok: true, value: 'tar.gz' });
  });

  it('빈 문자열은 EMPTY로 거부한다', () => {
    expect(normalizeExtensionInput('   ')).toEqual({ ok: false, reason: 'EMPTY' });
  });

  it('20자를 초과하면 TOO_LONG으로 거부한다', () => {
    expect(normalizeExtensionInput('a'.repeat(21))).toEqual({ ok: false, reason: 'TOO_LONG' });
  });

  it('하이픈/언더스코어/유니코드는 INVALID_CHARACTERS로 거부한다', () => {
    expect(normalizeExtensionInput('my-ext')).toEqual({ ok: false, reason: 'INVALID_CHARACTERS' });
    expect(normalizeExtensionInput('my_ext')).toEqual({ ok: false, reason: 'INVALID_CHARACTERS' });
    expect(normalizeExtensionInput('한글확장자')).toEqual({ ok: false, reason: 'INVALID_CHARACTERS' });
  });

  it('연속된 마침표는 INVALID_CHARACTERS로 거부한다', () => {
    expect(normalizeExtensionInput('tar..gz')).toEqual({ ok: false, reason: 'INVALID_CHARACTERS' });
  });

  it('마침표로 끝나면 INVALID_CHARACTERS로 거부한다', () => {
    expect(normalizeExtensionInput('tar.')).toEqual({ ok: false, reason: 'INVALID_CHARACTERS' });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- normalize`
Expected: FAIL, `Cannot find module './normalize'`

- [ ] **Step 3: 구현**

```ts
// lib/policy/normalize.ts
export type NormalizeExtensionResult =
  | { ok: true; value: string }
  | { ok: false; reason: 'EMPTY' | 'TOO_LONG' | 'INVALID_CHARACTERS' };

const EXTENSION_PATTERN = /^[a-z0-9]+(\.[a-z0-9]+)*$/;

export function normalizeExtensionInput(raw: string): NormalizeExtensionResult {
  let value = raw.trim();

  if (value.startsWith('.')) {
    value = value.slice(1);
  }

  value = value.toLowerCase();

  if (value.length === 0) {
    return { ok: false, reason: 'EMPTY' };
  }

  if (value.length > 20) {
    return { ok: false, reason: 'TOO_LONG' };
  }

  if (!EXTENSION_PATTERN.test(value)) {
    return { ok: false, reason: 'INVALID_CHARACTERS' };
  }

  return { ok: true, value };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- normalize`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 커스텀 확장자 입력 정규화 함수 추가"
```

---

### Task 8: 확장자 차단 판정

**Files:**
- Create: `lib/policy/match.ts`
- Test: `lib/policy/match.test.ts`

**Interfaces:**
- Consumes: 없음(순수 함수)
- Produces: `isExtensionBlocked(filename: string, blockedExtensions: readonly string[]): boolean`. Task 19(업로드 파이프라인)가 조회한 정책의 활성 확장자 목록을 넘겨 호출한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// lib/policy/match.test.ts
import { describe, expect, it } from 'vitest';
import { isExtensionBlocked } from './match';

describe('isExtensionBlocked', () => {
  it('단일 확장자를 대소문자 구분 없이 차단한다', () => {
    expect(isExtensionBlocked('tool.EXE', ['exe'])).toBe(true);
    expect(isExtensionBlocked('photo.jpg', ['exe'])).toBe(false);
  });

  it('복합 확장자를 등록하면 정확히 일치하는 파일만 차단한다', () => {
    expect(isExtensionBlocked('backup.tar.gz', ['tar.gz'])).toBe(true);
    expect(isExtensionBlocked('backup.gz', ['tar.gz'])).toBe(false);
  });

  it('단일 gz 등록 시 .gz로 끝나는 모든 파일을 차단한다', () => {
    expect(isExtensionBlocked('backup.tar.gz', ['gz'])).toBe(true);
  });

  it('확장자가 없는 파일은 차단하지 않는다', () => {
    expect(isExtensionBlocked('README', ['env'])).toBe(false);
    expect(isExtensionBlocked('Makefile', ['env'])).toBe(false);
  });

  it('점으로 끝나는 파일은 확장자 없는 파일로 취급한다', () => {
    expect(isExtensionBlocked('file.', ['env'])).toBe(false);
  });

  it('점으로 시작하는 파일은 접미사가 정확히 일치할 때만 차단한다', () => {
    expect(isExtensionBlocked('.env', ['env'])).toBe(true);
    expect(isExtensionBlocked('.env.local', ['env'])).toBe(false);
    expect(isExtensionBlocked('.env.local', ['env.local'])).toBe(true);
  });

  it('module.css 등록 시 button.module.css를 차단한다', () => {
    expect(isExtensionBlocked('button.module.css', ['module.css'])).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- match`
Expected: FAIL, `Cannot find module './match'`

- [ ] **Step 3: 구현**

```ts
// lib/policy/match.ts
export function isExtensionBlocked(filename: string, blockedExtensions: readonly string[]): boolean {
  const lowerFilename = filename.toLowerCase();
  return blockedExtensions.some((ext) => lowerFilename.endsWith(`.${ext}`));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- match`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 파일명 접미사 기반 확장자 차단 판정 함수 추가"
```

---

### Task 9: 파일명 검증

**Files:**
- Create: `lib/policy/filename.ts`
- Test: `lib/policy/filename.test.ts`

**Interfaces:**
- Consumes: 없음(순수 함수)
- Produces: `validateFilename(filename: string): { ok: true } | { ok: false; reason: 'EMPTY_FILENAME' | 'FILENAME_TOO_LONG' }`. Task 19와 `FileUploadSection`(Task 25)이 각각 서버/클라이언트에서 호출한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// lib/policy/filename.test.ts
import { describe, expect, it } from 'vitest';
import { validateFilename } from './filename';

describe('validateFilename', () => {
  it('정상 파일명은 통과한다', () => {
    expect(validateFilename('report.pdf')).toEqual({ ok: true });
  });

  it('빈 파일명은 EMPTY_FILENAME이다', () => {
    expect(validateFilename('')).toEqual({ ok: false, reason: 'EMPTY_FILENAME' });
  });

  it('UTF-8 기준 255바이트를 초과하면 FILENAME_TOO_LONG이다', () => {
    const longAscii = 'a'.repeat(256);
    expect(validateFilename(longAscii)).toEqual({ ok: false, reason: 'FILENAME_TOO_LONG' });
  });

  it('한글은 문자당 3바이트로 계산한다', () => {
    const koreanName = '가'.repeat(85) + '.txt'; // 85 * 3 = 255바이트 + 4바이트 > 255
    expect(validateFilename(koreanName)).toEqual({ ok: false, reason: 'FILENAME_TOO_LONG' });

    const withinLimit = '가'.repeat(80) + '.txt'; // 80 * 3 + 4 = 244바이트
    expect(validateFilename(withinLimit)).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- filename`
Expected: FAIL, `Cannot find module './filename'`

- [ ] **Step 3: 구현**

```ts
// lib/policy/filename.ts
const MAX_FILENAME_BYTES = 255;

export type FilenameValidationResult =
  | { ok: true }
  | { ok: false; reason: 'EMPTY_FILENAME' | 'FILENAME_TOO_LONG' };

export function validateFilename(filename: string): FilenameValidationResult {
  if (filename.length === 0) {
    return { ok: false, reason: 'EMPTY_FILENAME' };
  }

  const byteLength = new TextEncoder().encode(filename).length;
  if (byteLength > MAX_FILENAME_BYTES) {
    return { ok: false, reason: 'FILENAME_TOO_LONG' };
  }

  return { ok: true };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- filename`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: UTF-8 바이트 기준 파일명 검증 함수 추가"
```

---

### Task 10: `GET /api/policy`

**Files:**
- Create: `app/api/policy/route.ts`
- Test: `app/api/policy/route.test.ts`

**Interfaces:**
- Consumes: `createServiceRoleClient()`(Task 2), `extension_policy`/`upload_settings` 테이블(Task 3, 4)
- Produces: `GET` 핸들러가 `{ fixedExtensions, customExtensions, maxUploadSizeBytes }`를 반환. Task 20(`usePolicy` 훅)이 이 응답 형태를 그대로 소비한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// app/api/policy/route.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { GET } from './route';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

describe('GET /api/policy', () => {
  const supabase = createServiceRoleClient();

  beforeEach(async () => {
    await supabase.from('extension_policy').delete().eq('kind', 'custom');
  });

  it('고정 확장자, 커스텀 확장자, 업로드 크기를 함께 반환한다', async () => {
    await supabase.rpc('add_custom_extension', { p_name: 'sh' });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.fixedExtensions).toHaveLength(7);
    expect(body.customExtensions.some((e: { name: string }) => e.name === 'sh')).toBe(true);
    expect(body.maxUploadSizeBytes).toBe(10485760);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- app/api/policy/route`
Expected: FAIL, `Cannot find module './route'`

- [ ] **Step 3: 구현**

```ts
// app/api/policy/route.ts
import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

export async function GET() {
  const supabase = createServiceRoleClient();

  const [extensionsResult, settingsResult] = await Promise.all([
    supabase.from('extension_policy').select('id, name, kind, active').order('created_at', { ascending: true }),
    supabase.from('upload_settings').select('max_upload_size_bytes').eq('id', 1).single(),
  ]);

  if (extensionsResult.error || settingsResult.error || !extensionsResult.data || !settingsResult.data) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '정책을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.' } },
      { status: 500 },
    );
  }

  const extensions = extensionsResult.data;

  return NextResponse.json({
    fixedExtensions: extensions
      .filter((e) => e.kind === 'fixed')
      .map((e) => ({ name: e.name, active: e.active })),
    customExtensions: extensions
      .filter((e) => e.kind === 'custom')
      .map((e) => ({ id: e.id, name: e.name })),
    maxUploadSizeBytes: settingsResult.data.max_upload_size_bytes,
  });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- app/api/policy/route`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: GET /api/policy 구현"
```

---

### Task 11: `PATCH /api/policy/fixed-extensions/[name]`

**Files:**
- Create: `app/api/policy/fixed-extensions/[name]/route.ts`
- Test: `app/api/policy/fixed-extensions/[name]/route.test.ts`

**Interfaces:**
- Consumes: `createServiceRoleClient()`(Task 2)
- Produces: `PATCH` 핸들러가 `{ active: boolean }` 요청을 받아 `{ name, active }`를 반환. Task 21(`FixedExtensionsSection`)이 호출한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// app/api/policy/fixed-extensions/[name]/route.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { PATCH } from './route';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

describe('PATCH /api/policy/fixed-extensions/[name]', () => {
  const supabase = createServiceRoleClient();

  beforeEach(async () => {
    await supabase.from('extension_policy').update({ active: false }).eq('kind', 'fixed');
  });

  it('고정 확장자를 활성화한다', async () => {
    const request = new Request('http://localhost/api/policy/fixed-extensions/exe', {
      method: 'PATCH',
      body: JSON.stringify({ active: true }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ name: 'exe' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ name: 'exe', active: true });
  });

  it('존재하지 않는 고정 확장자는 404를 반환한다', async () => {
    const request = new Request('http://localhost/api/policy/fixed-extensions/notreal', {
      method: 'PATCH',
      body: JSON.stringify({ active: true }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ name: 'notreal' }) });
    expect(response.status).toBe(404);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- fixed-extensions`
Expected: FAIL, `Cannot find module './route'`

- [ ] **Step 3: 구현**

```ts
// app/api/policy/fixed-extensions/[name]/route.ts
import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

export async function PATCH(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const { active } = (await request.json()) as { active: boolean };

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('extension_policy')
    .update({ active })
    .eq('name', name)
    .eq('kind', 'fixed')
    .select('name, active')
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '저장에 실패했습니다. 잠시 후 다시 시도해주세요.' } },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: '존재하지 않는 고정 확장자입니다.' } },
      { status: 404 },
    );
  }

  return NextResponse.json(data);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- fixed-extensions`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: PATCH /api/policy/fixed-extensions/[name] 구현"
```

---

### Task 12: `POST /api/policy/custom-extensions`

**Files:**
- Create: `app/api/policy/custom-extensions/route.ts`
- Test: `app/api/policy/custom-extensions/route.test.ts`

**Interfaces:**
- Consumes: `normalizeExtensionInput`(Task 7), `add_custom_extension` RPC(Task 6)
- Produces: `POST` 핸들러가 `{ result, customExtension? , fixedExtension? }`를 반환(`docs/specs/DESIGN.md` 4.2절 형식). Task 22(`CustomExtensionsSection`)가 `result` 필드로 분기한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// app/api/policy/custom-extensions/route.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { POST } from './route';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

function postRequest(name: string) {
  return new Request('http://localhost/api/policy/custom-extensions', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

describe('POST /api/policy/custom-extensions', () => {
  const supabase = createServiceRoleClient();

  beforeEach(async () => {
    await supabase.from('extension_policy').delete().eq('kind', 'custom');
    await supabase.from('extension_policy').update({ active: false }).eq('kind', 'fixed');
  });

  it('새 커스텀 확장자를 201로 등록한다', async () => {
    const response = await POST(postRequest('sh'));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.result).toBe('custom_created');
    expect(body.customExtension.name).toBe('sh');
  });

  it('형식이 잘못된 입력은 400을 반환한다', async () => {
    const response = await POST(postRequest('my-ext'));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('INVALID_EXTENSION_FORMAT');
  });

  it('고정 확장자와 같은 값은 자동 활성화하고 200을 반환한다', async () => {
    const response = await POST(postRequest('exe'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result).toBe('fixed_auto_activated');
  });

  it('이미 활성 상태인 고정 확장자는 already_active를 반환한다', async () => {
    await POST(postRequest('exe'));
    const response = await POST(postRequest('exe'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result).toBe('fixed_already_active');
  });

  it('중복 등록은 409를 반환한다', async () => {
    await POST(postRequest('sh'));
    const response = await POST(postRequest('sh'));

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe('DUPLICATE_EXTENSION');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- app/api/policy/custom-extensions`
Expected: FAIL, `Cannot find module './route'`

- [ ] **Step 3: 구현**

```ts
// app/api/policy/custom-extensions/route.ts
import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server-client';
import { normalizeExtensionInput } from '@/lib/policy/normalize';

export async function POST(request: Request) {
  const { name } = (await request.json()) as { name: string };
  const normalized = normalizeExtensionInput(name ?? '');

  if (!normalized.ok) {
    return NextResponse.json(
      { error: { code: 'INVALID_EXTENSION_FORMAT', message: '허용되지 않는 형식의 확장자입니다.' } },
      { status: 400 },
    );
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc('add_custom_extension', { p_name: normalized.value });

  if (error) {
    if (error.message.includes('DUPLICATE_EXTENSION')) {
      return NextResponse.json(
        { error: { code: 'DUPLICATE_EXTENSION', message: '이미 등록된 확장자입니다.' } },
        { status: 409 },
      );
    }
    if (error.message.includes('CUSTOM_EXTENSION_LIMIT_EXCEEDED')) {
      return NextResponse.json(
        {
          error: {
            code: 'LIMIT_EXCEEDED',
            message: '최대 200개까지 등록할 수 있습니다. 기존 항목을 삭제한 후 다시 추가해주세요.',
          },
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '저장에 실패했습니다. 잠시 후 다시 시도해주세요.' } },
      { status: 500 },
    );
  }

  if (data.result === 'custom_created') {
    return NextResponse.json(
      { result: 'custom_created', customExtension: { id: data.id, name: data.name } },
      { status: 201 },
    );
  }

  return NextResponse.json(
    { result: data.result, fixedExtension: { name: data.name, active: data.active } },
    { status: 200 },
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- app/api/policy/custom-extensions`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: POST /api/policy/custom-extensions 구현"
```

---

### Task 13: `DELETE /api/policy/custom-extensions/[id]`

**Files:**
- Create: `app/api/policy/custom-extensions/[id]/route.ts`
- Test: `app/api/policy/custom-extensions/[id]/route.test.ts`

**Interfaces:**
- Consumes: `createServiceRoleClient()`(Task 2)
- Produces: `DELETE` 핸들러가 성공/이미 삭제됨 모두 204를 반환(멱등). Task 22가 호출한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// app/api/policy/custom-extensions/[id]/route.test.ts
import { describe, expect, it } from 'vitest';
import { DELETE } from './route';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

describe('DELETE /api/policy/custom-extensions/[id]', () => {
  const supabase = createServiceRoleClient();

  it('존재하는 커스텀 확장자를 삭제하고 204를 반환한다', async () => {
    const { data } = await supabase.rpc('add_custom_extension', { p_name: 'delme' });
    const request = new Request(`http://localhost/api/policy/custom-extensions/${data.id}`, { method: 'DELETE' });

    const response = await DELETE(request, { params: Promise.resolve({ id: data.id }) });
    expect(response.status).toBe(204);

    const { data: remaining } = await supabase.from('extension_policy').select('id').eq('id', data.id);
    expect(remaining).toHaveLength(0);
  });

  it('이미 삭제된 id를 다시 삭제해도 204를 반환한다', async () => {
    const request = new Request('http://localhost/api/policy/custom-extensions/00000000-0000-0000-0000-000000000000', {
      method: 'DELETE',
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }),
    });
    expect(response.status).toBe(204);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- custom-extensions/\[id\]`
Expected: FAIL, `Cannot find module './route'`

- [ ] **Step 3: 구현**

```ts
// app/api/policy/custom-extensions/[id]/route.ts
import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceRoleClient();

  const { error } = await supabase.from('extension_policy').delete().eq('id', id).eq('kind', 'custom');

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '삭제에 실패했습니다. 잠시 후 다시 시도해주세요.' } },
      { status: 500 },
    );
  }

  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- custom-extensions/\[id\]`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: DELETE /api/policy/custom-extensions/[id] 구현(멱등)"
```

---

### Task 14: `PUT /api/policy/upload-size`

**Files:**
- Create: `app/api/policy/upload-size/route.ts`
- Test: `app/api/policy/upload-size/route.test.ts`

**Interfaces:**
- Consumes: `createServiceRoleClient()`(Task 2)
- Produces: `PUT` 핸들러가 `{ maxUploadSizeBytes }` 요청을 받아 저장하고 같은 형태로 응답. Task 23(`UploadSizeSection`)이 호출한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// app/api/policy/upload-size/route.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { PUT } from './route';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

describe('PUT /api/policy/upload-size', () => {
  const supabase = createServiceRoleClient();

  afterEach(async () => {
    await supabase.from('upload_settings').update({ max_upload_size_bytes: 10485760 }).eq('id', 1);
  });

  it('허용된 값으로 변경한다', async () => {
    const request = new Request('http://localhost/api/policy/upload-size', {
      method: 'PUT',
      body: JSON.stringify({ maxUploadSizeBytes: 20971520 }),
    });

    const response = await PUT(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.maxUploadSizeBytes).toBe(20971520);
  });

  it('허용되지 않은 값은 400을 반환한다', async () => {
    const request = new Request('http://localhost/api/policy/upload-size', {
      method: 'PUT',
      body: JSON.stringify({ maxUploadSizeBytes: 999 }),
    });

    const response = await PUT(request);
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- upload-size`
Expected: FAIL, `Cannot find module './route'`

- [ ] **Step 3: 구현**

```ts
// app/api/policy/upload-size/route.ts
import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

const ALLOWED_SIZES = [1048576, 5242880, 10485760, 20971520, 52428800];

export async function PUT(request: Request) {
  const { maxUploadSizeBytes } = (await request.json()) as { maxUploadSizeBytes: number };

  if (!ALLOWED_SIZES.includes(maxUploadSizeBytes)) {
    return NextResponse.json(
      { error: { code: 'INVALID_UPLOAD_SIZE', message: '허용되지 않는 업로드 크기입니다.' } },
      { status: 400 },
    );
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from('upload_settings')
    .update({ max_upload_size_bytes: maxUploadSizeBytes, updated_at: new Date().toISOString() })
    .eq('id', 1);

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '저장에 실패했습니다. 잠시 후 다시 시도해주세요.' } },
      { status: 500 },
    );
  }

  return NextResponse.json({ maxUploadSizeBytes });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- upload-size`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: PUT /api/policy/upload-size 구현"
```

---

### Task 15: ClamAV 클라이언트 모듈

**Files:**
- Create: `lib/clamav/client.ts`
- Test: `lib/clamav/client.test.ts`

**Interfaces:**
- Consumes: 환경변수 `CLAMAV_HOST`, `CLAMAV_PORT`, `CLAMAV_TIMEOUT_MS`
- Produces: `scanFile(buffer: Buffer): Promise<{ isInfected: boolean }>`, `pingClamAv(): Promise<boolean>`. Task 16(헬스체크)과 Task 19(업로드 파이프라인)가 사용한다. 이 태스크는 실제 `clamd`가 로컬에 떠 있어야 통과한다(`docs/specs/DESIGN.md` 2절: 같은 컨테이너에서 `clamd` 실행). 로컬 개발에서는 `docker run -p 3310:3310 clamav/clamav` 등으로 기동한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// lib/clamav/client.test.ts
import { describe, expect, it } from 'vitest';
import { pingClamAv, scanFile } from './client';

describe('ClamAV client', () => {
  it('clamd에 ping이 성공한다', async () => {
    const result = await pingClamAv();
    expect(result).toBe(true);
  });

  it('EICAR 테스트 문자열을 악성으로 탐지한다', async () => {
    const eicar = Buffer.from(
      'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
    );
    const result = await scanFile(eicar);
    expect(result.isInfected).toBe(true);
  });

  it('정상 파일은 감염되지 않은 것으로 판정한다', async () => {
    const clean = Buffer.from('hello world');
    const result = await scanFile(clean);
    expect(result.isInfected).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- lib/clamav/client`
Expected: FAIL, `Cannot find module './client'`

- [ ] **Step 3: 구현**

```ts
// lib/clamav/client.ts
import NodeClam from 'clamscan';
import { Readable } from 'node:stream';

let clientPromise: ReturnType<typeof createClient> | undefined;

function createClient() {
  return new NodeClam().init({
    removeInfected: false,
    clamdscan: {
      host: process.env.CLAMAV_HOST ?? '127.0.0.1',
      port: Number(process.env.CLAMAV_PORT ?? 3310),
      timeout: Number(process.env.CLAMAV_TIMEOUT_MS ?? 30000),
    },
  });
}

function getClient() {
  if (!clientPromise) {
    clientPromise = createClient();
  }
  return clientPromise;
}

export async function pingClamAv(): Promise<boolean> {
  try {
    const client = await getClient();
    await client.ping();
    return true;
  } catch {
    return false;
  }
}

export async function scanFile(buffer: Buffer): Promise<{ isInfected: boolean }> {
  const client = await getClient();
  const stream = Readable.from(buffer);
  const { isInfected } = await client.scanStream(stream);
  return { isInfected: Boolean(isInfected) };
}
```

- [ ] **Step 4: 테스트 통과 확인**(로컬 `clamd` 기동 후)

Run: `npm test -- lib/clamav/client`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: clamscan(NodeClam) 기반 ClamAV 클라이언트 모듈 추가"
```

---

### Task 16: `GET /api/health`

**Files:**
- Create: `app/api/health/route.ts`
- Test: `app/api/health/route.test.ts`

**Interfaces:**
- Consumes: `pingClamAv()`(Task 15)
- Produces: `GET` 핸들러가 Ready면 200, Not Ready면 503

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// app/api/health/route.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/clamav/client', () => ({
  pingClamAv: vi.fn(),
}));

import { GET } from './route';
import { pingClamAv } from '@/lib/clamav/client';

describe('GET /api/health', () => {
  it('clamd가 응답하면 200을 반환한다', async () => {
    vi.mocked(pingClamAv).mockResolvedValue(true);
    const response = await GET();
    expect(response.status).toBe(200);
  });

  it('clamd가 응답하지 않으면 503을 반환한다', async () => {
    vi.mocked(pingClamAv).mockResolvedValue(false);
    const response = await GET();
    expect(response.status).toBe(503);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- app/api/health`
Expected: FAIL, `Cannot find module './route'`

- [ ] **Step 3: 구현**

```ts
// app/api/health/route.ts
import { NextResponse } from 'next/server';
import { pingClamAv } from '@/lib/clamav/client';

export async function GET() {
  const isReady = await pingClamAv();
  return NextResponse.json({ ready: isReady }, { status: isReady ? 200 : 503 });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- app/api/health`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: GET /api/health로 ClamAV 준비 상태 확인 구현"
```

---

### Task 17: 업로드 오류 타입과 구조화 로거

**Files:**
- Create: `lib/policy/errors.ts`, `lib/logging/logger.ts`
- Test: `lib/logging/logger.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `UploadError`(코드, 상태, 메시지를 담는 클래스), `logUploadResult(entry: UploadLogEntry): void`. Task 19가 두 가지 모두 사용한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// lib/logging/logger.test.ts
import { describe, expect, it, vi } from 'vitest';
import { logUploadResult } from './logger';

describe('logUploadResult', () => {
  it('구조화된 필드만 기록하고 파일 내용/경로는 포함하지 않는다', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // 타입에 없는 필드(storageKey, fileContent)를 호출부 실수로 끼워 넣은 상황을
    // 가정해, 로거가 화이트리스트로 실제로 걸러내는지 검증한다(단순히 원래
    // 넣지 않은 필드가 없다는 동어반복 검증이 되지 않도록).
    logUploadResult({
      requestId: 'req-1',
      result: 'rejected',
      reason: 'BLOCKED_EXTENSION',
      extension: 'exe',
      fileSizeBytes: 1024,
      durationMs: 12,
      storageKey: 'uploads/should-not-appear',
      fileContent: 'binary-data-should-not-appear',
    } as UploadLogEntry & { storageKey: string; fileContent: string });

    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged.requestId).toBe('req-1');
    expect(logged.reason).toBe('BLOCKED_EXTENSION');
    expect(logged).not.toHaveProperty('storageKey');
    expect(logged).not.toHaveProperty('fileContent');

    spy.mockRestore();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- logger`
Expected: FAIL, `Cannot find module './logger'`

- [ ] **Step 3: 구현**

```ts
// lib/policy/errors.ts
export type UploadErrorCode =
  | 'INVALID_MULTIPART_REQUEST'
  | 'FILE_REQUIRED'
  | 'MULTIPLE_FILES_NOT_ALLOWED'
  | 'REQUEST_TOO_LARGE'
  | 'EMPTY_FILENAME'
  | 'FILENAME_TOO_LONG'
  | 'BLOCKED_EXTENSION'
  | 'FILE_SIZE_EXCEEDED'
  | 'CLAMAV_MALWARE_DETECTED'
  | 'CLAMAV_UNAVAILABLE'
  | 'STORAGE_SAVE_FAILED'
  | 'METADATA_SAVE_FAILED'
  | 'INTERNAL_ERROR';

export class UploadError extends Error {
  constructor(
    public readonly code: UploadErrorCode,
    public readonly status: number,
    public readonly userMessage: string,
  ) {
    super(code);
    this.name = 'UploadError';
  }
}
```

```ts
// lib/logging/logger.ts
export interface UploadLogEntry {
  requestId: string;
  result: 'success' | 'rejected' | 'failed';
  reason?: string;
  detail?: string;
  extension?: string;
  fileSizeBytes?: number;
  durationMs: number;
  cleanupResult?: 'SUCCESS' | 'FAILED';
  cleanupErrorCode?: string | null;
}

export function logUploadResult(entry: UploadLogEntry): void {
  // 호출부가 실수로 민감한 필드(예: storageKey, fileContent)를 함께 넘기더라도
  // 로그에 남지 않도록 스프레드 대신 필드를 하나씩 명시적으로 화이트리스트한다.
  const record = {
    requestId: entry.requestId,
    result: entry.result,
    reason: entry.reason,
    detail: entry.detail,
    extension: entry.extension,
    fileSizeBytes: entry.fileSizeBytes,
    durationMs: entry.durationMs,
    cleanupResult: entry.cleanupResult,
    cleanupErrorCode: entry.cleanupErrorCode,
    createdAt: new Date().toISOString(),
  };
  console.log(JSON.stringify(record));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- logger`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 업로드 오류 타입과 구조화 로거 추가"
```

---

### Task 18: Storage 저장과 보상 삭제

**Files:**
- Create: `lib/upload/storage.ts`
- Test: `lib/upload/storage.test.ts`

**Interfaces:**
- Consumes: `createServiceRoleClient()`(Task 2)
- Produces: `saveToStorage(id: string, buffer: Buffer): Promise<void>`, `deleteFromStorage(id: string): Promise<{ ok: boolean }>`. Task 19가 3.4절 보상 흐름에서 사용한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// lib/upload/storage.test.ts
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { deleteFromStorage, saveToStorage } from './storage';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

describe('Storage 저장과 삭제', () => {
  it('버퍼를 저장하고 다시 삭제할 수 있다', async () => {
    const id = randomUUID();
    await saveToStorage(id, Buffer.from('hello'));

    const supabase = createServiceRoleClient();
    const { data } = await supabase.storage
      .from(process.env.SUPABASE_STORAGE_BUCKET ?? 'uploads')
      .download(`uploads/${id}`);
    expect(data).not.toBeNull();

    const result = await deleteFromStorage(id);
    expect(result.ok).toBe(true);
  });

  it('존재하지 않는 객체를 삭제해도 실패로 처리하지 않는다', async () => {
    const result = await deleteFromStorage(randomUUID());
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- lib/upload/storage`
Expected: FAIL, `Cannot find module './storage'`

- [ ] **Step 3: 구현**

```ts
// lib/upload/storage.ts
import { createServiceRoleClient } from '@/lib/supabase/server-client';

function bucket() {
  return process.env.SUPABASE_STORAGE_BUCKET ?? 'uploads';
}

function objectKey(id: string) {
  return `uploads/${id}`;
}

export async function saveToStorage(id: string, buffer: Buffer): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.storage
    .from(bucket())
    .upload(objectKey(id), buffer, { contentType: 'application/octet-stream' });

  if (error) {
    throw error;
  }
}

export async function deleteFromStorage(id: string): Promise<{ ok: boolean }> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.storage.from(bucket()).remove([objectKey(id)]);
  return { ok: !error };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- lib/upload/storage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: Supabase Storage 저장/삭제 헬퍼 추가"
```

---

### Task 19: `POST /api/uploads` 업로드 파이프라인

**Files:**
- Create: `lib/upload/pipeline.ts`, `app/api/uploads/route.ts`
- Test: `lib/upload/pipeline.test.ts`

**Interfaces:**
- Consumes: `validateFilename`(Task 9), `isExtensionBlocked`(Task 8), `scanFile`(Task 15), `saveToStorage`/`deleteFromStorage`(Task 18), `logUploadResult`(Task 17), `UploadError`(Task 17)
- Produces: `runUploadPipeline(input: { file: File; requestId: string }): Promise<{ originalFilename: string; fileSizeBytes: number; normalizedExtension: string | null }>`(성공 시) 또는 `UploadError`를 던짐. `app/api/uploads/route.ts`의 `POST`가 이 함수를 감싸 HTTP 응답으로 변환한다.

이 태스크는 `docs/specs/DESIGN.md` 5.1절의 검증 순서(0~7단계)를 그대로 구현한다. ClamAV는 `vi.mock`으로 대체해 `clamd` 없이도 파이프라인 로직을 검증하고, 실제 ClamAV 연동은 Task 15에서 이미 별도로 검증했다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// lib/upload/pipeline.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/clamav/client', () => ({ scanFile: vi.fn() }));
vi.mock('@/lib/upload/storage', () => ({ saveToStorage: vi.fn(), deleteFromStorage: vi.fn() }));
vi.mock('@/lib/logging/logger', () => ({ logUploadResult: vi.fn() }));

import { runUploadPipeline } from './pipeline';
import { scanFile } from '@/lib/clamav/client';
import { saveToStorage } from '@/lib/upload/storage';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

function makeFile(name: string, content: string, type = 'text/plain') {
  return new File([content], name, { type });
}

describe('runUploadPipeline', () => {
  const supabase = createServiceRoleClient();

  beforeEach(async () => {
    vi.mocked(scanFile).mockResolvedValue({ isInfected: false });
    vi.mocked(saveToStorage).mockResolvedValue(undefined);
    await supabase.from('extension_policy').update({ active: false }).eq('kind', 'fixed');
    await supabase.from('upload_settings').update({ max_upload_size_bytes: 10485760 }).eq('id', 1);
  });

  it('정상 파일은 저장하고 메타데이터를 반환한다', async () => {
    const result = await runUploadPipeline({ file: makeFile('photo.jpg', 'binary-data'), requestId: 'req-ok' });
    expect(result.originalFilename).toBe('photo.jpg');
    expect(result.normalizedExtension).toBe('jpg');
  });

  it('빈 파일명은 EMPTY_FILENAME으로 거부한다', async () => {
    await expect(
      runUploadPipeline({ file: makeFile('', 'data'), requestId: 'req-empty' }),
    ).rejects.toMatchObject({ code: 'EMPTY_FILENAME' });
  });

  it('차단된 확장자는 BLOCKED_EXTENSION으로 거부한다', async () => {
    await supabase.from('extension_policy').update({ active: true }).eq('name', 'exe');
    await expect(
      runUploadPipeline({ file: makeFile('tool.exe', 'data'), requestId: 'req-blocked' }),
    ).rejects.toMatchObject({ code: 'BLOCKED_EXTENSION' });
  });

  it('정책 크기를 초과하면 FILE_SIZE_EXCEEDED로 거부한다', async () => {
    await supabase.from('upload_settings').update({ max_upload_size_bytes: 1048576 }).eq('id', 1);
    const big = 'a'.repeat(1048577);
    await expect(
      runUploadPipeline({ file: makeFile('big.txt', big), requestId: 'req-big' }),
    ).rejects.toMatchObject({ code: 'FILE_SIZE_EXCEEDED' });
  });

  it('ClamAV가 악성으로 탐지하면 CLAMAV_MALWARE_DETECTED로 거부한다', async () => {
    vi.mocked(scanFile).mockResolvedValue({ isInfected: true });
    await expect(
      runUploadPipeline({ file: makeFile('virus.txt', 'data'), requestId: 'req-virus' }),
    ).rejects.toMatchObject({ code: 'CLAMAV_MALWARE_DETECTED' });
  });

  it('ClamAV 연결이 실패하면 CLAMAV_UNAVAILABLE로 거부한다', async () => {
    vi.mocked(scanFile).mockRejectedValue(new Error('connection refused'));
    await expect(
      runUploadPipeline({ file: makeFile('clean.txt', 'data'), requestId: 'req-clamdown' }),
    ).rejects.toMatchObject({ code: 'CLAMAV_UNAVAILABLE' });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- lib/upload/pipeline`
Expected: FAIL, `Cannot find module './pipeline'`

- [ ] **Step 3: 구현**

```ts
// lib/upload/pipeline.ts
import { randomUUID } from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/server-client';
import { validateFilename } from '@/lib/policy/filename';
import { isExtensionBlocked } from '@/lib/policy/match';
import { scanFile } from '@/lib/clamav/client';
import { saveToStorage, deleteFromStorage } from '@/lib/upload/storage';
import { logUploadResult } from '@/lib/logging/logger';
import { UploadError } from '@/lib/policy/errors';

export interface UploadPipelineInput {
  file: File;
  requestId: string;
}

export interface UploadPipelineResult {
  originalFilename: string;
  fileSizeBytes: number;
  normalizedExtension: string | null;
}

function extractExtension(filename: string): string | null {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === filename.length - 1) {
    return null;
  }
  return filename.slice(lastDot + 1).toLowerCase();
}

export async function runUploadPipeline(input: UploadPipelineInput): Promise<UploadPipelineResult> {
  const start = Date.now();
  const { file, requestId } = input;
  const fileSizeBytes = file.size;

  const filenameCheck = validateFilename(file.name);
  if (!filenameCheck.ok) {
    logUploadResult({ requestId, result: 'rejected', reason: 'INVALID_FILENAME', detail: filenameCheck.reason, durationMs: Date.now() - start });
    const message = filenameCheck.reason === 'EMPTY_FILENAME' ? '파일명이 비어 있습니다.' : '파일명이 너무 깁니다.';
    throw new UploadError(filenameCheck.reason, 400, message);
  }

  const supabase = createServiceRoleClient();
  const [{ data: extensions }, { data: settings }] = await Promise.all([
    supabase.from('extension_policy').select('name').eq('active', true),
    supabase.from('upload_settings').select('max_upload_size_bytes').eq('id', 1).single(),
  ]);

  const blockedExtensions = (extensions ?? []).map((e) => e.name);
  if (isExtensionBlocked(file.name, blockedExtensions)) {
    logUploadResult({ requestId, result: 'rejected', reason: 'BLOCKED_EXTENSION', fileSizeBytes, durationMs: Date.now() - start });
    throw new UploadError('BLOCKED_EXTENSION', 400, `"${file.name}"은 차단된 확장자로 업로드할 수 없습니다.`);
  }

  const maxUploadSizeBytes = settings?.max_upload_size_bytes ?? 10485760;
  if (fileSizeBytes > maxUploadSizeBytes) {
    logUploadResult({ requestId, result: 'rejected', reason: 'FILE_SIZE_EXCEEDED', fileSizeBytes, durationMs: Date.now() - start });
    throw new UploadError('FILE_SIZE_EXCEEDED', 400, `파일 크기가 현재 설정된 최대 크기(${maxUploadSizeBytes}바이트)를 초과했습니다.`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let scanResult: { isInfected: boolean };
  try {
    scanResult = await scanFile(buffer);
  } catch {
    logUploadResult({ requestId, result: 'failed', reason: 'CLAMAV_UNAVAILABLE', fileSizeBytes, durationMs: Date.now() - start });
    throw new UploadError('CLAMAV_UNAVAILABLE', 503, '파일 검사에 실패했습니다. 잠시 후 다시 시도해주세요.');
  }

  if (scanResult.isInfected) {
    logUploadResult({ requestId, result: 'rejected', reason: 'CLAMAV_MALWARE_DETECTED', fileSizeBytes, durationMs: Date.now() - start });
    throw new UploadError('CLAMAV_MALWARE_DETECTED', 400, '악성 파일로 탐지되어 업로드할 수 없습니다.');
  }

  const id = randomUUID();
  try {
    await saveToStorage(id, buffer);
  } catch {
    logUploadResult({ requestId, result: 'failed', reason: 'STORAGE_SAVE_FAILED', fileSizeBytes, durationMs: Date.now() - start });
    throw new UploadError('STORAGE_SAVE_FAILED', 502, '일시적인 오류가 발생했습니다. 다시 시도해주세요.');
  }

  const normalizedExtension = extractExtension(file.name);
  const { error: insertError } = await supabase.from('uploads').insert({
    id,
    original_filename: file.name,
    normalized_extension: normalizedExtension,
    declared_mime_type: file.type || null,
    file_size_bytes: fileSizeBytes,
  });

  if (insertError) {
    const cleanup = await deleteFromStorage(id);
    logUploadResult({
      requestId,
      result: 'failed',
      reason: 'METADATA_SAVE_FAILED',
      fileSizeBytes,
      cleanupResult: cleanup.ok ? 'SUCCESS' : 'FAILED',
      cleanupErrorCode: cleanup.ok ? null : 'STORAGE_DELETE_FAILED',
      durationMs: Date.now() - start,
    });
    throw new UploadError('METADATA_SAVE_FAILED', 500, '일시적인 오류가 발생했습니다. 다시 시도해주세요.');
  }

  logUploadResult({ requestId, result: 'success', extension: normalizedExtension ?? undefined, fileSizeBytes, durationMs: Date.now() - start });

  return { originalFilename: file.name, fileSizeBytes, normalizedExtension };
}
```

```ts
// app/api/uploads/route.ts
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { runUploadPipeline } from '@/lib/upload/pipeline';
import { UploadError } from '@/lib/policy/errors';

const SERVER_MAX_REQUEST_BYTES = Number(process.env.SERVER_MAX_REQUEST_BYTES ?? 58720256);

export async function POST(request: Request) {
  const requestId = randomUUID();

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > SERVER_MAX_REQUEST_BYTES) {
    return NextResponse.json(
      { error: { code: 'REQUEST_TOO_LARGE', message: '요청할 수 있는 최대 크기를 초과했습니다. 더 작은 파일을 선택해주세요.' } },
      { status: 413 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_MULTIPART_REQUEST', message: '업로드 요청 형식이 올바르지 않습니다.' } },
      { status: 400 },
    );
  }

  const files = formData.getAll('file');
  if (files.length === 0) {
    return NextResponse.json(
      { error: { code: 'FILE_REQUIRED', message: '업로드할 파일을 선택해주세요.' } },
      { status: 400 },
    );
  }
  if (files.length > 1) {
    return NextResponse.json(
      { error: { code: 'MULTIPLE_FILES_NOT_ALLOWED', message: '한 번에 파일 하나만 업로드할 수 있습니다.' } },
      { status: 400 },
    );
  }

  try {
    const result = await runUploadPipeline({ file: files[0] as File, requestId });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof UploadError) {
      return NextResponse.json({ error: { code: error.code, message: error.userMessage } }, { status: error.status });
    }
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '일시적인 오류가 발생했습니다. 다시 시도해주세요.' } },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- lib/upload/pipeline`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 업로드 검증 파이프라인과 POST /api/uploads 구현"
```

---

### Task 20: `usePolicy` 훅

**Files:**
- Create: `components/usePolicy.ts`
- Test: `components/usePolicy.test.ts`

**Interfaces:**
- Consumes: `GET /api/policy`(Task 10)
- Produces: `usePolicy(): { policy, isLoading, error, refetch }`. Task 21~24가 이 훅으로 정책 상태를 공유한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// components/usePolicy.test.ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePolicy } from './usePolicy';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('usePolicy', () => {
  it('정책을 불러오면 로딩 상태가 해제된다', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ fixedExtensions: [], customExtensions: [], maxUploadSizeBytes: 10485760 })),
    );

    const { result } = renderHook(() => usePolicy());
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.policy?.maxUploadSizeBytes).toBe(10485760);
  });

  it('조회가 실패하면 error를 설정한다', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));

    const { result } = renderHook(() => usePolicy());
    await waitFor(() => expect(result.current.error).not.toBeNull());
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- usePolicy`
Expected: FAIL, `Cannot find module './usePolicy'`

- [ ] **Step 3: 구현**

```ts
// components/usePolicy.ts
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- usePolicy`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 정책 조회 훅(usePolicy) 추가"
```

---

### Task 21: `FixedExtensionsSection`(Debounce 저장)

**Files:**
- Create: `components/FixedExtensionsSection.tsx`
- Test: `components/FixedExtensionsSection.test.tsx`

**Interfaces:**
- Consumes: `PATCH /api/policy/fixed-extensions/[name]`(Task 11)
- Produces: `<FixedExtensionsSection extensions={...} onSaved={...} />`. `docs/specs/PLANNING.md` 5.1절(500ms Debounce, 저장 중 표시)을 구현한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// components/FixedExtensionsSection.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FixedExtensionsSection } from './FixedExtensionsSection';

describe('FixedExtensionsSection', () => {
  it('체크 후 500ms 뒤에만 저장 요청을 보낸다', async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ delay: null });
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ name: 'exe', active: true })));

    render(<FixedExtensionsSection extensions={[{ name: 'exe', active: false }]} />);

    await user.click(screen.getByLabelText('exe'));
    expect(fetchSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    expect(fetchSpy).toHaveBeenCalledWith('/api/policy/fixed-extensions/exe', expect.objectContaining({ method: 'PATCH' }));

    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- FixedExtensionsSection`
Expected: FAIL, `Cannot find module './FixedExtensionsSection'`

- [ ] **Step 3: 구현**

```tsx
// components/FixedExtensionsSection.tsx
'use client';

import { useEffect, useRef, useState } from 'react';

interface FixedExtension {
  name: string;
  active: boolean;
}

const SAVE_DEBOUNCE_MS = 500;

export function FixedExtensionsSection({ extensions }: { extensions: FixedExtension[] }) {
  const [state, setState] = useState(extensions);
  const [savingName, setSavingName] = useState<string | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => setState(extensions), [extensions]);

  function handleToggle(name: string) {
    setState((prev) => prev.map((e) => (e.name === name ? { ...e, active: !e.active } : e)));

    if (timers.current[name]) {
      clearTimeout(timers.current[name]);
    }

    timers.current[name] = setTimeout(async () => {
      setSavingName(name);
      const target = state.find((e) => e.name === name);
      const nextActive = target ? !target.active : true;
      try {
        await fetch(`/api/policy/fixed-extensions/${name}`, {
          method: 'PATCH',
          body: JSON.stringify({ active: nextActive }),
        });
      } finally {
        setSavingName(null);
      }
    }, SAVE_DEBOUNCE_MS);
  }

  return (
    <fieldset>
      <legend>고정 확장자</legend>
      {state.map((ext) => (
        <label key={ext.name} htmlFor={`fixed-${ext.name}`}>
          <input
            id={`fixed-${ext.name}`}
            type="checkbox"
            checked={ext.active}
            onChange={() => handleToggle(ext.name)}
          />
          {ext.name}
        </label>
      ))}
      {savingName && <span role="status">저장 중</span>}
    </fieldset>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- FixedExtensionsSection`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 고정 확장자 섹션(Debounce 저장) 구현"
```

---

### Task 22: `CustomExtensionsSection`

**Files:**
- Create: `components/CustomExtensionsSection.tsx`
- Test: `components/CustomExtensionsSection.test.tsx`

**Interfaces:**
- Consumes: `POST`/`DELETE /api/policy/custom-extensions`(Task 12, 13)
- Produces: `<CustomExtensionsSection extensions={...} />`. `docs/specs/PLANNING.md` 5.2절(20자/200개 표시, 인라인 오류)을 구현한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// components/CustomExtensionsSection.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomExtensionsSection } from './CustomExtensionsSection';

describe('CustomExtensionsSection', () => {
  it('빈 입력이면 추가 버튼이 비활성화된다', () => {
    render(<CustomExtensionsSection extensions={[]} />);
    expect(screen.getByRole('button', { name: '추가' })).toBeDisabled();
  });

  it('정상 입력 후 추가하면 목록에 반영되고 입력값이 초기화된다', async () => {
    const user = userEvent.setup();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ result: 'custom_created', customExtension: { id: '1', name: 'sh' } }), { status: 201 }),
    );

    render(<CustomExtensionsSection extensions={[]} />);
    const input = screen.getByLabelText('커스텀 확장자 입력');

    await user.type(input, 'sh');
    await user.click(screen.getByRole('button', { name: '추가' }));

    expect(await screen.findByText('sh')).toBeInTheDocument();
    expect(input).toHaveValue('');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- CustomExtensionsSection`
Expected: FAIL, `Cannot find module './CustomExtensionsSection'`

- [ ] **Step 3: 구현**

```tsx
// components/CustomExtensionsSection.tsx
'use client';

import { useState } from 'react';

interface CustomExtension {
  id: string;
  name: string;
}

export function CustomExtensionsSection({ extensions }: { extensions: CustomExtension[] }) {
  const [list, setList] = useState(extensions);
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const trimmed = input.trim();
  const canSubmit = trimmed.length > 0 && !isSubmitting && list.length < 200;

  async function handleAdd() {
    setIsSubmitting(true);
    setInlineError(null);
    try {
      const response = await fetch('/api/policy/custom-extensions', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed }),
      });
      const body = await response.json();

      if (!response.ok) {
        setInlineError(body.error.message);
        return;
      }

      if (body.result === 'custom_created') {
        setList((prev) => [...prev, body.customExtension]);
        setInput('');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setList((prev) => prev.map((e) => (e.id === id ? { ...e, deleting: true } : e)));
    const response = await fetch(`/api/policy/custom-extensions/${id}`, { method: 'DELETE' });
    if (response.ok) {
      setList((prev) => prev.filter((e) => e.id !== id));
    }
  }

  return (
    <section>
      <label htmlFor="custom-extension-input">커스텀 확장자 입력</label>
      <input
        id="custom-extension-input"
        maxLength={20}
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      <span>{input.length}/20</span>
      <button type="button" onClick={handleAdd} disabled={!canSubmit}>
        {isSubmitting ? '추가 중...' : '추가'}
      </button>
      {inlineError && <p role="alert">{inlineError}</p>}
      <span>{list.length}/200</span>
      <ul>
        {list.map((ext) => (
          <li key={ext.id}>
            {ext.name}
            <button type="button" aria-label={`${ext.name} 삭제`} onClick={() => handleDelete(ext.id)}>
              X
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- CustomExtensionsSection`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 커스텀 확장자 섹션(추가/삭제) 구현"
```

---

### Task 23: `UploadSizeSection`

**Files:**
- Create: `components/UploadSizeSection.tsx`
- Test: `components/UploadSizeSection.test.tsx`

**Interfaces:**
- Consumes: `PUT /api/policy/upload-size`(Task 14)
- Produces: `<UploadSizeSection maxUploadSizeBytes={...} />`

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// components/UploadSizeSection.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UploadSizeSection } from './UploadSizeSection';

describe('UploadSizeSection', () => {
  it('값을 변경하면 저장 요청을 보낸다', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ maxUploadSizeBytes: 20971520 })));

    render(<UploadSizeSection maxUploadSizeBytes={10485760} />);
    await user.selectOptions(screen.getByLabelText('업로드 최대 크기'), '20971520');

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/policy/upload-size',
      expect.objectContaining({ method: 'PUT' }),
    );
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- UploadSizeSection`
Expected: FAIL, `Cannot find module './UploadSizeSection'`

- [ ] **Step 3: 구현**

```tsx
// components/UploadSizeSection.tsx
'use client';

import { useState } from 'react';

const OPTIONS = [
  { label: '1MB', value: 1048576 },
  { label: '5MB', value: 5242880 },
  { label: '10MB', value: 10485760 },
  { label: '20MB', value: 20971520 },
  { label: '50MB', value: 52428800 },
];

export function UploadSizeSection({ maxUploadSizeBytes }: { maxUploadSizeBytes: number }) {
  const [value, setValue] = useState(maxUploadSizeBytes);

  async function handleChange(next: number) {
    const previous = value;
    setValue(next);
    const response = await fetch('/api/policy/upload-size', {
      method: 'PUT',
      body: JSON.stringify({ maxUploadSizeBytes: next }),
    });
    if (!response.ok) {
      setValue(previous);
    }
  }

  return (
    <label htmlFor="upload-size-select">
      업로드 최대 크기
      <select
        id="upload-size-select"
        value={value}
        onChange={(e) => handleChange(Number(e.target.value))}
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- UploadSizeSection`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 업로드 크기 정책 섹션 구현"
```

---

### Task 24: `useToast`와 `ToastRegion`

**Files:**
- Create: `components/useToast.ts`, `components/ToastRegion.tsx`
- Test: `components/useToast.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `useToast(): { toast, showSuccess, showError }`, `<ToastRegion toast={...} onDismiss={...} />`. Task 21~23, 25가 저장 성공/실패 안내에 사용한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// components/useToast.test.ts
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useToast } from './useToast';

describe('useToast', () => {
  it('한 번에 하나의 토스트만 유지한다', () => {
    const { result } = renderHook(() => useToast());

    act(() => result.current.showSuccess('첫 번째'));
    act(() => result.current.showError('두 번째'));

    expect(result.current.toast).toEqual({ kind: 'error', message: '두 번째' });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- useToast`
Expected: FAIL, `Cannot find module './useToast'`

- [ ] **Step 3: 구현**

```ts
// components/useToast.ts
'use client';

import { useCallback, useState } from 'react';

export interface Toast {
  kind: 'success' | 'error';
  message: string;
}

const SUCCESS_AUTO_DISMISS_MS = 3000;

export function useToast() {
  const [toast, setToast] = useState<Toast | null>(null);

  const showSuccess = useCallback((message: string) => {
    setToast({ kind: 'success', message });
    setTimeout(() => setToast((current) => (current?.message === message ? null : current)), SUCCESS_AUTO_DISMISS_MS);
  }, []);

  const showError = useCallback((message: string) => {
    setToast({ kind: 'error', message });
  }, []);

  const dismiss = useCallback(() => setToast(null), []);

  return { toast, showSuccess, showError, dismiss };
}
```

```tsx
// components/ToastRegion.tsx
'use client';

import type { Toast } from './useToast';

export function ToastRegion({ toast, onDismiss }: { toast: Toast | null; onDismiss: () => void }) {
  if (!toast) return null;

  return (
    <div role="status" aria-live="polite">
      <p>{toast.message}</p>
      {toast.kind === 'error' && (
        <button type="button" onClick={onDismiss} aria-label="알림 닫기">
          닫기
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- useToast`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 전역 토스트 상태와 알림 영역 구현"
```

---

### Task 25: `FileUploadSection`

**Files:**
- Create: `components/FileUploadSection.tsx`
- Test: `components/FileUploadSection.test.tsx`

**Interfaces:**
- Consumes: `POST /api/uploads`(Task 19), `validateFilename`(Task 9)
- Produces: `<FileUploadSection />`. `docs/specs/PLANNING.md` 8절(단계별 화면 표현)을 구현한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// components/FileUploadSection.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileUploadSection } from './FileUploadSection';

describe('FileUploadSection', () => {
  it('업로드 성공 시 결과를 표시하고 파일 선택을 초기화한다', async () => {
    const user = userEvent.setup();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ originalFilename: 'photo.jpg', fileSizeBytes: 1024, normalizedExtension: 'jpg' }), {
        status: 201,
      }),
    );

    render(<FileUploadSection />);
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('파일 선택'), file);
    await user.click(screen.getByRole('button', { name: '업로드' }));

    expect(await screen.findByText(/photo.jpg.*업로드에 성공했습니다/)).toBeInTheDocument();
  });

  it('업로드 거부 시 사유를 표시하고 파일 선택을 유지한다', async () => {
    const user = userEvent.setup();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'BLOCKED_EXTENSION', message: '차단된 확장자입니다.' } }), {
        status: 400,
      }),
    );

    render(<FileUploadSection />);
    const file = new File(['data'], 'tool.exe', { type: 'application/x-msdownload' });
    await user.upload(screen.getByLabelText('파일 선택'), file);
    await user.click(screen.getByRole('button', { name: '업로드' }));

    expect(await screen.findByText(/차단된 확장자입니다/)).toBeInTheDocument();
    expect(screen.getByLabelText('파일 선택')).toHaveProperty('files');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- FileUploadSection`
Expected: FAIL, `Cannot find module './FileUploadSection'`

- [ ] **Step 3: 구현**

```tsx
// components/FileUploadSection.tsx
'use client';

import { useRef, useState } from 'react';

interface SuccessResult {
  kind: 'success';
  filename: string;
  fileSizeBytes: number;
}

interface FailureResult {
  kind: 'failure';
  filename: string;
  message: string;
}

export function FileUploadSection() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<SuccessResult | FailureResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSelect(nextFile: File | null) {
    setFile(nextFile);
    setResult(null);
  }

  async function handleUpload() {
    if (!file) return;
    setIsUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/uploads', { method: 'POST', body: formData });
      const body = await response.json();

      if (response.ok) {
        setResult({ kind: 'success', filename: body.originalFilename, fileSizeBytes: body.fileSizeBytes });
        setFile(null);
        if (inputRef.current) inputRef.current.value = '';
      } else {
        setResult({ kind: 'failure', filename: file.name, message: body.error.message });
      }
    } catch {
      setResult({ kind: 'failure', filename: file.name, message: '서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.' });
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <section>
      <label htmlFor="file-input">파일 선택</label>
      <input
        id="file-input"
        ref={inputRef}
        type="file"
        onChange={(e) => handleSelect(e.target.files?.[0] ?? null)}
      />

      {file && <p>{file.name}</p>}

      <button type="button" onClick={handleUpload} disabled={!file || isUploading}>
        업로드
      </button>

      {isUploading && <p role="status">업로드 중...</p>}

      {result?.kind === 'success' && (
        <p role="status">
          {`"${result.filename}" 업로드에 성공했습니다`} ({result.fileSizeBytes}바이트)
        </p>
      )}

      {result?.kind === 'failure' && (
        <p role="alert">
          {`"${result.filename}"은 `}
          {result.message}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- FileUploadSection`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 파일 업로드 섹션 구현"
```

---

### Task 26: `page.tsx` 컴포지션

**Files:**
- Modify: `app/page.tsx`
- Test: `app/page.test.tsx`

**Interfaces:**
- Consumes: `usePolicy`(Task 20), `FixedExtensionsSection`(21), `CustomExtensionsSection`(22), `UploadSizeSection`(23), `FileUploadSection`(25)
- Produces: 실제 화면. 이 태스크로 5개 영역이 한 화면에 모두 렌더링된다.

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// app/page.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Page from './page';

describe('메인 화면', () => {
  it('정책 조회 후 4개 섹션을 모두 렌더링한다', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          fixedExtensions: [{ name: 'exe', active: false }],
          customExtensions: [],
          maxUploadSizeBytes: 10485760,
        }),
      ),
    );

    render(<Page />);

    expect(await screen.findByText('고정 확장자')).toBeInTheDocument();
    expect(screen.getByLabelText('커스텀 확장자 입력')).toBeInTheDocument();
    expect(screen.getByLabelText('업로드 최대 크기')).toBeInTheDocument();
    expect(screen.getByLabelText('파일 선택')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- app/page`
Expected: FAIL(로딩 상태만 표시되거나 섹션 요소를 찾지 못함)

- [ ] **Step 3: 구현**

```tsx
// app/page.tsx
'use client';

import { usePolicy } from '@/components/usePolicy';
import { FixedExtensionsSection } from '@/components/FixedExtensionsSection';
import { CustomExtensionsSection } from '@/components/CustomExtensionsSection';
import { UploadSizeSection } from '@/components/UploadSizeSection';
import { FileUploadSection } from '@/components/FileUploadSection';

export default function Page() {
  const { policy, isLoading, error, refetch } = usePolicy();

  if (isLoading) {
    return <p role="status">불러오는 중...</p>;
  }

  if (error || !policy) {
    return (
      <div>
        <p role="alert">정책을 불러오지 못했습니다.</p>
        <button type="button" onClick={refetch}>
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <main>
      <h1>확장자 차단 및 업로드 관리</h1>
      <FixedExtensionsSection extensions={policy.fixedExtensions} />
      <CustomExtensionsSection extensions={policy.customExtensions} />
      <UploadSizeSection maxUploadSizeBytes={policy.maxUploadSizeBytes} />
      <FileUploadSection />
    </main>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- app/page`
Expected: PASS

- [ ] **Step 5: 전체 테스트와 빌드 확인**

Run: `npm test && npm run build`
Expected: 모든 테스트 통과, 빌드 성공

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: 단일 화면에 5개 섹션 컴포지션"
```

---

## Self-Review 메모(작성자용, 실행 시 삭제 가능)

- **스펙 커버리지**: DESIGN.md 3~5절(데이터 모델/API/업로드 흐름)은 Task 3~19가, PLANNING.md 5~8절(화면 섹션)은 Task 20~26이 다룬다. DESIGN.md 6절(Debounce/토스트 수치)은 Task 21, 24에 반영했다. 7절 테스트 전략의 항목들은 각 태스크의 테스트로 흩어져 있으며, RPC 동시성 테스트(199개 상태, 동시 추가)는 Task 6에 포함했다.
- **범위 밖으로 남긴 것**: Docker/Dockerfile 작성, `clamd` 컨테이너 설정, 실제 배포 플랫폼 설정, 접근성 세부 스타일(`:focus-visible` CSS), 반응형 CSS는 `docs/WORKFLOW.md` 7단계(배포) 또는 이 계획 이후의 스타일링 작업으로 남겨둔다. 이 계획은 기능 동작과 서버 검증, 테스트를 우선 확보하는 데 집중했다.
- **타입 일관성**: `UploadError.code`(Task 17)와 `app/api/uploads/route.ts`(Task 19)의 `error.code` 문자열, `lib/policy/filename.ts`의 `reason` 값이 `docs/specs/DESIGN.md` 4.4절 표의 코드와 동일한지 확인했다.
