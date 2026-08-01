# 커스텀 확장자 일괄 등록, .extignore, 정책 초기화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 커스텀 확장자 등록에 일괄 입력 모드(쉼표 구분 텍스트, `.extignore` 파일 import/export)와 확장자 정책 초기화 기능을 추가한다.

**Architecture:** 기존 `add_custom_extension` Postgres RPC와 같은 advisory lock 키를 공유하는 새 배치 RPC(`add_custom_extensions_batch`)와 초기화 RPC(`reset_extension_policy`)를 추가해 원자성을 보장한다. 클라이언트는 `lib/policy/normalize.ts`를 재사용하는 새 순수 함수(`lib/policy/batchParse.ts`)로 분리/정규화/형식 검증까지 마친 뒤 서버에 제출하고, 서버는 기존 커스텀 중복 제외, 고정 확장자 자동 활성화, 200개 제한을 하나의 트랜잭션으로 처리한다.

**Tech Stack:** Next.js App Router(Route Handlers), Supabase(Postgres RPC, `@supabase/supabase-js` service role client), React(`use client` 훅+컴포넌트), Vitest + Testing Library, Tailwind CSS.

## Global Constraints

- 커밋 메시지는 Conventional Commits 형식, 설명은 한국어로 작성한다(레포 `CLAUDE.md`).
- 사용자의 명시적 요청 없이 push나 PR을 생성하지 않는다. 각 태스크의 "Commit" 스텝은 로컬 커밋만 수행한다(이 저장소의 기존 관례 — 태스크 단위 커밋 — 를 따른다). 설계 문서(`docs/superpowers/specs/...`) 자체는 이 계획과 별개로, 구현과 문서 반영이 모두 끝난 뒤 함께 커밋하기로 이미 결정되어 있다.
- Markdown 문서가 변경되면 `document-review`를 실행한다(Task 13 이후).
- 의미 있는 작업이 끝나면 `prompt-log`로 기록하고 `PROMPT_LOG.md`에 확정한다(Task 14).
- 정규화 규칙의 단일 진실 공급원은 `lib/policy/normalize.ts`다. 새 코드에서 정규화 정규식을 다시 만들지 않는다.
- 새 RPC는 기존 `add_custom_extension`과 동일한 advisory lock 키 `hashtext('extension_policy_custom_add')`를 공유해야 한다. 다른 키를 쓰면 단일 등록과 배치 등록이 동시에 들어올 때 200개 제한이 깨질 수 있다(설계 문서 3절).
- 확장자 정책 초기화는 `upload_settings`(업로드 최대 크기)를 건드리지 않는다.
- `vitest.config.mts`가 `fileParallelism: false`로 설정되어 있다 — 통합 테스트가 같은 로컬 Postgres를 공유하기 때문이다. 새 테스트 파일도 이 전제(같은 DB, 파일 간 순차 실행)를 따른다.
- 참고 설계 문서: `docs/superpowers/specs/2026-08-01-custom-extension-batch-extignore-design.md`

---

## Task 1: 배치 등록/초기화 Postgres RPC

**Files:**
- Create: `supabase/migrations/0006_custom_extension_batch_and_reset_rpc.sql`
- Test: `supabase/migrations/0006_custom_extension_batch_and_reset_rpc.test.ts`

**Interfaces:**
- Produces: RPC `add_custom_extensions_batch(p_names text[])`가 반환하는 `add_custom_extensions_batch_result` 복합 타입 — 필드 `added text[]`, `fixed_activated text[]`, `skipped_existing_count integer`
- Produces: RPC `reset_extension_policy()`가 반환하는 `reset_extension_policy_result` 복합 타입 — 필드 `deleted_custom_count integer`, `deactivated_fixed_count integer`
- Consumes: 기존 `extension_policy` 테이블(`supabase/migrations/0001_extension_policy.sql`), 기존 advisory lock 키 `'extension_policy_custom_add'`(`supabase/migrations/0004_add_custom_extension_rpc.sql`)

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// supabase/migrations/0006_custom_extension_batch_and_reset_rpc.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

describe('add_custom_extensions_batch RPC', () => {
  const supabase = createServiceRoleClient();

  beforeEach(async () => {
    await supabase.from('extension_policy').delete().eq('kind', 'custom');
    await supabase.from('extension_policy').update({ active: false }).eq('kind', 'fixed');
  });

  it('새 커스텀 확장자 여러 개를 한 번에 등록한다', async () => {
    const { data, error } = await supabase.rpc('add_custom_extensions_batch', { p_names: ['sh', 'bak'] });
    expect(error).toBeNull();
    expect(data.added.sort()).toEqual(['bak', 'sh']);
    expect(data.fixed_activated).toEqual([]);
    expect(data.skipped_existing_count).toBe(0);
  });

  it('비활성 고정 확장자 이름이 섞여 있으면 자동 활성화하고 added에는 포함하지 않는다', async () => {
    const { data } = await supabase.rpc('add_custom_extensions_batch', { p_names: ['exe', 'sh'] });
    expect(data.added).toEqual(['sh']);
    expect(data.fixed_activated).toEqual(['exe']);

    const { data: fixedRow } = await supabase.from('extension_policy').select('active').eq('name', 'exe').single();
    expect(fixedRow?.active).toBe(true);
  });

  it('이미 활성 상태인 고정 확장자는 skipped_existing_count에 포함되고 fixed_activated에는 없다', async () => {
    await supabase.from('extension_policy').update({ active: true }).eq('name', 'exe');
    const { data } = await supabase.rpc('add_custom_extensions_batch', { p_names: ['exe'] });
    expect(data.fixed_activated).toEqual([]);
    expect(data.skipped_existing_count).toBe(1);
  });

  it('이미 등록된 커스텀 확장자는 조용히 제외하고 나머지만 등록한다(오류 아님)', async () => {
    await supabase.rpc('add_custom_extensions_batch', { p_names: ['sh'] });
    const { data, error } = await supabase.rpc('add_custom_extensions_batch', { p_names: ['sh', 'bak'] });
    expect(error).toBeNull();
    expect(data.added).toEqual(['bak']);
    expect(data.skipped_existing_count).toBe(1);
  });

  it('입력 내부 중복은 하나로 처리한다', async () => {
    const { data } = await supabase.rpc('add_custom_extensions_batch', { p_names: ['sh', 'sh'] });
    expect(data.added).toEqual(['sh']);
  });

  it('신규 커스텀이 0개여도 성공 처리한다(모두 기존 중복이거나 고정 자동 활성화)', async () => {
    await supabase.rpc('add_custom_extensions_batch', { p_names: ['sh'] });
    const { data, error } = await supabase.rpc('add_custom_extensions_batch', { p_names: ['sh', 'exe'] });
    expect(error).toBeNull();
    expect(data.added).toEqual([]);
    expect(data.fixed_activated).toEqual(['exe']);
    expect(data.skipped_existing_count).toBe(1);
  });

  it('형식이 잘못된 이름이 하나라도 있으면 전체 실패하고 유효한 이름도 저장되지 않는다', async () => {
    const { error } = await supabase.rpc('add_custom_extensions_batch', { p_names: ['sh', 'MY EXT'] });
    expect(error?.message).toMatch(/INVALID_EXTENSION_NAME/);

    const { data: shRow } = await supabase.from('extension_policy').select('id').eq('name', 'sh').maybeSingle();
    expect(shRow).toBeNull();
  });

  it('처리 후 200개를 초과하면 전체 롤백된다', async () => {
    const seedRows = Array.from({ length: 199 }, (_, i) => ({ name: `seed${i}`, kind: 'custom' as const, active: true }));
    await supabase.from('extension_policy').insert(seedRows);

    const { error } = await supabase.rpc('add_custom_extensions_batch', { p_names: ['new1', 'new2'] });
    expect(error?.message).toMatch(/CUSTOM_EXTENSION_LIMIT_EXCEEDED/);

    const { count } = await supabase.from('extension_policy').select('*', { count: 'exact', head: true }).eq('kind', 'custom');
    expect(count).toBe(199);
  });

  it('단일 등록 RPC와 같은 advisory lock을 공유해 동시 요청에서도 200개 제한을 지킨다', async () => {
    const seedRows = Array.from({ length: 198 }, (_, i) => ({ name: `seed${i}`, kind: 'custom' as const, active: true }));
    await supabase.from('extension_policy').insert(seedRows);

    await Promise.allSettled([
      supabase.rpc('add_custom_extensions_batch', { p_names: ['batcha', 'batchb'] }),
      supabase.rpc('add_custom_extension', { p_name: 'singlec' }),
    ]);

    const { count } = await supabase.from('extension_policy').select('*', { count: 'exact', head: true }).eq('kind', 'custom');
    expect(count).toBeLessThanOrEqual(200);
  });
});

describe('reset_extension_policy RPC', () => {
  const supabase = createServiceRoleClient();

  beforeEach(async () => {
    await supabase.from('extension_policy').delete().eq('kind', 'custom');
    await supabase.from('extension_policy').update({ active: false }).eq('kind', 'fixed');
  });

  it('커스텀 확장자를 모두 삭제하고 고정 확장자를 모두 비활성화한다', async () => {
    await supabase.rpc('add_custom_extension', { p_name: 'sh' });
    await supabase.from('extension_policy').update({ active: true }).eq('name', 'exe');

    const { data, error } = await supabase.rpc('reset_extension_policy');
    expect(error).toBeNull();
    expect(data.deleted_custom_count).toBe(1);
    expect(data.deactivated_fixed_count).toBe(1);

    const { count: customCount } = await supabase.from('extension_policy').select('*', { count: 'exact', head: true }).eq('kind', 'custom');
    expect(customCount).toBe(0);

    const { data: fixedRows } = await supabase.from('extension_policy').select('active').eq('kind', 'fixed');
    expect(fixedRows?.every((row) => row.active === false)).toBe(true);
  });

  it('업로드 최대 크기 정책은 건드리지 않는다', async () => {
    await supabase.from('upload_settings').update({ max_upload_size_bytes: 20971520 }).eq('id', 1);
    await supabase.rpc('reset_extension_policy');

    const { data } = await supabase.from('upload_settings').select('max_upload_size_bytes').eq('id', 1).single();
    expect(data?.max_upload_size_bytes).toBe(20971520);

    await supabase.from('upload_settings').update({ max_upload_size_bytes: 10485760 }).eq('id', 1);
  });

  it('이미 모두 비활성/비어 있는 상태에서도 오류 없이 0을 반환한다', async () => {
    const { data, error } = await supabase.rpc('reset_extension_policy');
    expect(error).toBeNull();
    expect(data.deleted_custom_count).toBe(0);
    expect(data.deactivated_fixed_count).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- 0006_custom_extension_batch_and_reset_rpc`
Expected: FAIL, `function add_custom_extensions_batch(unknown) does not exist` (또는 유사한 RPC 부재 오류)

- [ ] **Step 3: 마이그레이션 작성**

```sql
-- supabase/migrations/0006_custom_extension_batch_and_reset_rpc.sql
create type add_custom_extensions_batch_result as (
  added                   text[],
  fixed_activated         text[],
  skipped_existing_count  integer
);

create or replace function add_custom_extensions_batch(p_names text[])
returns add_custom_extensions_batch_result
language plpgsql
as $$
declare
  v_name            text;
  v_existing        extension_policy;
  v_added           text[] := '{}';
  v_fixed_activated text[] := '{}';
  v_skipped_count   integer := 0;
  v_distinct_names  text[];
begin
  if p_names is null or array_length(p_names, 1) is null then
    raise exception using errcode = 'P0001', message = 'EMPTY_BATCH';
  end if;

  select array_agg(distinct name) into v_distinct_names from unnest(p_names) as name;

  -- 형식 검증은 잠금 밖에서 먼저 끝낸다(add_custom_extension과 동일한 순서 —
  -- 잠금을 오래 붙들지 않기 위함).
  foreach v_name in array v_distinct_names loop
    if v_name is null
       or v_name <> lower(v_name)
       or char_length(v_name) < 1
       or char_length(v_name) > 20
       or v_name !~ '^[a-z0-9]+(\.[a-z0-9]+)*$'
    then
      raise exception using errcode = 'P0001', message = 'INVALID_EXTENSION_NAME';
    end if;
  end loop;

  -- add_custom_extension(단일 등록)과 동일한 키를 공유해야 한다. 다른 키를 쓰면
  -- 단일 등록과 배치 등록이 동시에 들어올 때 200개 제한이 깨질 수 있다.
  perform pg_advisory_xact_lock(hashtext('extension_policy_custom_add'));

  foreach v_name in array v_distinct_names loop
    select * into v_existing from extension_policy where name = v_name;

    if found then
      if v_existing.kind = 'fixed' then
        update extension_policy
        set active = true
        where id = v_existing.id and active = false;

        if found then
          v_fixed_activated := array_append(v_fixed_activated, v_name);
        else
          v_skipped_count := v_skipped_count + 1;
        end if;
      else
        -- 이미 등록된 커스텀 확장자 — 오류가 아니라 조용히 건너뛴다
        -- (설계 문서 2절: 배치 모드의 기존 커스텀 중복 처리는 단일 모드와 다르다).
        v_skipped_count := v_skipped_count + 1;
      end if;
    else
      if (select count(*) from extension_policy where kind = 'custom') >= 200 then
        raise exception using errcode = 'P0001', message = 'CUSTOM_EXTENSION_LIMIT_EXCEEDED';
      end if;

      insert into extension_policy (name, kind, active) values (v_name, 'custom', true);
      v_added := array_append(v_added, v_name);
    end if;
  end loop;

  return row(v_added, v_fixed_activated, v_skipped_count)::add_custom_extensions_batch_result;
end;
$$;

revoke execute on function add_custom_extensions_batch(text[]) from public, anon, authenticated;
grant execute on function add_custom_extensions_batch(text[]) to service_role;

create type reset_extension_policy_result as (
  deleted_custom_count     integer,
  deactivated_fixed_count  integer
);

create or replace function reset_extension_policy()
returns reset_extension_policy_result
language plpgsql
as $$
declare
  v_deleted_count      integer;
  v_deactivated_count  integer;
begin
  -- 배치/단일 등록과 같은 잠금을 공유해, 초기화 도중 등록 요청이 끼어들어 생기는
  -- 혼란스러운 인터리빙을 피한다(설계 문서 5절).
  perform pg_advisory_xact_lock(hashtext('extension_policy_custom_add'));

  with deleted as (
    delete from extension_policy where kind = 'custom' returning 1
  )
  select count(*) into v_deleted_count from deleted;

  with deactivated as (
    update extension_policy set active = false where kind = 'fixed' and active = true returning 1
  )
  select count(*) into v_deactivated_count from deactivated;

  return row(v_deleted_count, v_deactivated_count)::reset_extension_policy_result;
end;
$$;

revoke execute on function reset_extension_policy() from public, anon, authenticated;
grant execute on function reset_extension_policy() to service_role;
```

- [ ] **Step 4: 마이그레이션 적용과 테스트 통과 확인**

Run: `npx supabase migration up && npm test -- 0006_custom_extension_batch_and_reset_rpc`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0006_custom_extension_batch_and_reset_rpc.sql supabase/migrations/0006_custom_extension_batch_and_reset_rpc.test.ts
git commit -m "feat: 커스텀 확장자 배치 등록/정책 초기화 RPC 추가"
```

---

## Task 2: 일괄 입력 파싱 순수 함수

**Files:**
- Create: `lib/policy/batchParse.ts`
- Test: `lib/policy/batchParse.test.ts`

**Interfaces:**
- Consumes: `normalizeExtensionInput`, `NormalizeExtensionResult` (`lib/policy/normalize.ts`, 기존)
- Produces: `splitByComma(raw: string): string[]`, `splitByLine(raw: string): string[]`, `parseBatchItems(rawItems: string[]): BatchParseResult`
- Produces: `type BatchParseResult = { ok: true; items: string[] } | { ok: false; invalidItems: string[] }`

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// lib/policy/batchParse.test.ts
import { describe, expect, it } from 'vitest';
import { parseBatchItems, splitByComma, splitByLine } from './batchParse';

describe('splitByComma', () => {
  it('쉼표로 구분한다', () => {
    expect(splitByComma('exe,pdf,tar.gz')).toEqual(['exe', 'pdf', 'tar.gz']);
  });

  it('줄바꿈은 구분자로 인정하지 않는다(한 항목의 일부로 남는다)', () => {
    expect(splitByComma('exe\npdf')).toEqual(['exe\npdf']);
  });
});

describe('splitByLine', () => {
  it('\\n으로 구분한다', () => {
    expect(splitByLine('out\ntxt\ntar.gz')).toEqual(['out', 'txt', 'tar.gz']);
  });

  it('\\r\\n도 구분자로 인정한다', () => {
    expect(splitByLine('out\r\ntxt')).toEqual(['out', 'txt']);
  });

  it('빈 줄을 허용한다(이후 trim/빈 값 제거 단계에서 걸러진다)', () => {
    expect(splitByLine('out\n\ntxt')).toEqual(['out', '', 'txt']);
  });
});

describe('parseBatchItems', () => {
  it('trim, 빈 값 제거, 정규화, 입력 내부 중복 제거를 거쳐 정상 목록을 반환한다', () => {
    const result = parseBatchItems([' exe ', '', 'PDF', 'exe', 'tar.gz']);
    expect(result).toEqual({ ok: true, items: ['exe', 'pdf', 'tar.gz'] });
  });

  it('빈 배열이나 공백만 있는 입력은 빈 목록으로 성공 처리한다', () => {
    expect(parseBatchItems([' ', '  '])).toEqual({ ok: true, items: [] });
  });

  it('형식 오류 항목이 있으면 실패하고, 문제 항목(트림된 원문)을 모두 모아 반환한다', () => {
    const result = parseBatchItems(['exe', 'very-long-extension-name-over-20', 'my-ext']);
    expect(result).toEqual({
      ok: false,
      invalidItems: ['very-long-extension-name-over-20', 'my-ext'],
    });
  });

  it('20자를 초과하는 항목만 실패로 잡는다(단일 모드와 동일한 항목별 기준)', () => {
    const result = parseBatchItems(['exe', 'pdf', 'very-long-extension-name']);
    expect(result).toEqual({ ok: false, invalidItems: ['very-long-extension-name'] });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- lib/policy/batchParse`
Expected: FAIL, `Cannot find module './batchParse'`

- [ ] **Step 3: 구현**

```typescript
// lib/policy/batchParse.ts
import { normalizeExtensionInput } from './normalize';

export type BatchParseResult = { ok: true; items: string[] } | { ok: false; invalidItems: string[] };

export function splitByComma(raw: string): string[] {
  return raw.split(',');
}

export function splitByLine(raw: string): string[] {
  return raw.split(/\r\n|\n/);
}

// 공통 파이프라인(설계 문서 2절): trim → 빈 값 제거 → 항목별 normalize → 형식 검증 → 입력 내부 중복 제거.
// 이후 단계(기존 커스텀 중복 제외, 고정 확장자 자동 활성화, 200개 제한)는 서버 상태가 필요해
// 이 함수의 책임 밖이다(app/api/policy/custom-extensions/batch/route.ts, Task 4에서 처리).
export function parseBatchItems(rawItems: string[]): BatchParseResult {
  const trimmed = rawItems.map((item) => item.trim()).filter((item) => item.length > 0);

  const invalidItems: string[] = [];
  const validItems: string[] = [];

  for (const raw of trimmed) {
    const result = normalizeExtensionInput(raw);
    if (result.ok) {
      validItems.push(result.value);
    } else {
      invalidItems.push(raw);
    }
  }

  if (invalidItems.length > 0) {
    return { ok: false, invalidItems };
  }

  const seen = new Set<string>();
  const deduped = validItems.filter((item) => {
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  });

  return { ok: true, items: deduped };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- lib/policy/batchParse`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/policy/batchParse.ts lib/policy/batchParse.test.ts
git commit -m "feat: 일괄 입력 분리/정규화 파이프라인 순수 함수 추가"
```

---

## Task 3: .extignore 콘텐츠 생성 순수 함수

**Files:**
- Create: `lib/policy/extignore.ts`
- Test: `lib/policy/extignore.test.ts`

**Interfaces:**
- Produces: `buildExtignoreContent(policy: ExtignorePolicyInput): string`, `type ExtignorePolicyInput = { fixedExtensions: { name: string; active: boolean }[]; customExtensions: { name: string }[] }`

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// lib/policy/extignore.test.ts
import { describe, expect, it } from 'vitest';
import { buildExtignoreContent } from './extignore';

describe('buildExtignoreContent', () => {
  it('활성 고정 확장자(알파벳순) 다음에 커스텀 확장자(알파벳순)를 줄바꿈으로 이어붙인다', () => {
    const content = buildExtignoreContent({
      fixedExtensions: [
        { name: 'exe', active: true },
        { name: 'bat', active: false },
        { name: 'js', active: true },
      ],
      customExtensions: [{ name: 'tar.gz' }, { name: 'sh' }],
    });

    expect(content).toBe('exe\njs\nsh\ntar.gz');
  });

  it('비활성 고정 확장자는 제외한다', () => {
    const content = buildExtignoreContent({
      fixedExtensions: [{ name: 'exe', active: false }],
      customExtensions: [],
    });

    expect(content).toBe('');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- lib/policy/extignore`
Expected: FAIL, `Cannot find module './extignore'`

- [ ] **Step 3: 구현**

```typescript
// lib/policy/extignore.ts
export interface ExtignorePolicyInput {
  fixedExtensions: { name: string; active: boolean }[];
  customExtensions: { name: string }[];
}

// 설계 문서 4절: 활성 고정 확장자(알파벳순) → 커스텀 확장자(알파벳순), 줄바꿈으로 연결.
// 서버 API 없이 클라이언트가 이미 로드된 정책 상태로 파일 내용을 직접 만든다.
export function buildExtignoreContent(policy: ExtignorePolicyInput): string {
  const activeFixed = policy.fixedExtensions
    .filter((extension) => extension.active)
    .map((extension) => extension.name)
    .sort();
  const custom = policy.customExtensions.map((extension) => extension.name).sort();

  return [...activeFixed, ...custom].join('\n');
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- lib/policy/extignore`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/policy/extignore.ts lib/policy/extignore.test.ts
git commit -m "feat: .extignore 콘텐츠 생성 순수 함수 추가"
```

---

## Task 4: 배치 등록 API

**Files:**
- Create: `app/api/policy/custom-extensions/batch/route.ts`
- Test: `app/api/policy/custom-extensions/batch/route.test.ts`

**Interfaces:**
- Consumes: `normalizeExtensionInput` (`lib/policy/normalize.ts`), `createServiceRoleClient` (`lib/supabase/server-client.ts`), RPC `add_custom_extensions_batch` (Task 1)
- Produces: `POST` — 성공 시 `{ added: string[], fixedActivated: string[], skippedExistingCount: number }`(200), 형식 오류 시 `{ error: { code: 'INVALID_ITEMS', message: string, invalidItems: string[] } }`(400), 200개 초과 시 `{ error: { code: 'LIMIT_EXCEEDED', message: string } }`(409)

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// app/api/policy/custom-extensions/batch/route.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST } from './route';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

function postRequest(body: unknown) {
  return new Request('http://localhost/api/policy/custom-extensions/batch', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/policy/custom-extensions/batch', () => {
  const supabase = createServiceRoleClient();

  beforeEach(async () => {
    await supabase.from('extension_policy').delete().eq('kind', 'custom');
    await supabase.from('extension_policy').update({ active: false }).eq('kind', 'fixed');
  });

  afterEach(async () => {
    await supabase.from('extension_policy').delete().eq('kind', 'custom');
    await supabase.from('extension_policy').update({ active: false }).eq('kind', 'fixed');
  });

  it('여러 개를 한 번에 등록하고 요약을 200으로 반환한다', async () => {
    const response = await POST(postRequest({ items: ['exe', 'sh', 'bak'] }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.added.sort()).toEqual(['bak', 'sh']);
    expect(body.fixedActivated).toEqual(['exe']);
    expect(body.skippedExistingCount).toBe(0);
  });

  it('형식 오류 항목이 있으면 400과 함께 문제 항목 전체를 반환하고 아무것도 저장하지 않는다', async () => {
    const response = await POST(postRequest({ items: ['sh', 'my-ext'] }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('INVALID_ITEMS');
    expect(body.error.invalidItems).toEqual(['my-ext']);

    const { data } = await supabase.from('extension_policy').select('id').eq('name', 'sh').maybeSingle();
    expect(data).toBeNull();
  });

  it('처리 후 200개를 초과하면 409를 반환한다', async () => {
    const seedRows = Array.from({ length: 199 }, (_, i) => ({ name: `seed${i}`, kind: 'custom' as const, active: true }));
    await supabase.from('extension_policy').insert(seedRows);

    const response = await POST(postRequest({ items: ['new1', 'new2'] }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe('LIMIT_EXCEEDED');
  });

  it('items가 빈 배열이면 400을 반환한다', async () => {
    const response = await POST(postRequest({ items: [] }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('INVALID_REQUEST_BODY');
  });

  it('items가 문자열 배열이 아니면 400을 반환한다', async () => {
    const response = await POST(postRequest({ items: 'exe,pdf' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('INVALID_REQUEST_BODY');
  });

  it('JSON으로 파싱할 수 없는 요청 본문은 400을 반환한다', async () => {
    const request = new Request('http://localhost/api/policy/custom-extensions/batch', {
      method: 'POST',
      body: 'not-json',
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- app/api/policy/custom-extensions/batch/route`
Expected: FAIL, `Cannot find module './route'`

- [ ] **Step 3: 구현**

```typescript
// app/api/policy/custom-extensions/batch/route.ts
import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server-client';
import { normalizeExtensionInput } from '@/lib/policy/normalize';

export async function POST(request: Request) {
  let body: { items?: unknown };
  try {
    body = (await request.json()) as { items?: unknown };
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_REQUEST_BODY', message: '요청 형식이 올바르지 않습니다.' } },
      { status: 400 },
    );
  }

  const { items } = body;
  if (!Array.isArray(items) || items.length === 0 || items.some((item) => typeof item !== 'string')) {
    return NextResponse.json(
      { error: { code: 'INVALID_REQUEST_BODY', message: '요청 형식이 올바르지 않습니다.' } },
      { status: 400 },
    );
  }

  // 이 배열은 클라이언트(useCustomExtensionsBatch, Task 6)가 이미 분리·trim·정규화·형식
  // 검증·내부 중복 제거를 마친 값이 기본 경로다. 직접 API를 호출하는 경우에 대비해
  // 서버도 각 항목을 다시 정규화/검증한다.
  const invalidItems: string[] = [];
  const normalizedNames: string[] = [];
  for (const raw of items as string[]) {
    const result = normalizeExtensionInput(raw);
    if (result.ok) {
      normalizedNames.push(result.value);
    } else {
      invalidItems.push(raw);
    }
  }

  if (invalidItems.length > 0) {
    return NextResponse.json(
      { error: { code: 'INVALID_ITEMS', message: '올바르지 않은 항목이 있습니다.', invalidItems } },
      { status: 400 },
    );
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc('add_custom_extensions_batch', { p_names: normalizedNames });

  if (error) {
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
    if (error.message.includes('INVALID_EXTENSION_NAME') || error.message.includes('EMPTY_BATCH')) {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST_BODY', message: '요청 형식이 올바르지 않습니다.' } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '저장에 실패했습니다. 잠시 후 다시 시도해주세요.' } },
      { status: 500 },
    );
  }

  return NextResponse.json({
    added: data.added,
    fixedActivated: data.fixed_activated,
    skippedExistingCount: data.skipped_existing_count,
  });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- app/api/policy/custom-extensions/batch/route`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/policy/custom-extensions/batch/route.ts app/api/policy/custom-extensions/batch/route.test.ts
git commit -m "feat: 커스텀 확장자 배치 등록 API 추가"
```

---

## Task 5: 정책 초기화 API

**Files:**
- Create: `app/api/policy/reset/route.ts`
- Test: `app/api/policy/reset/route.test.ts`

**Interfaces:**
- Consumes: `createServiceRoleClient` (`lib/supabase/server-client.ts`), RPC `reset_extension_policy` (Task 1)
- Produces: `POST` — 성공 시 `{ deletedCustomCount: number, deactivatedFixedCount: number }`(200)

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// app/api/policy/reset/route.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST } from './route';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

describe('POST /api/policy/reset', () => {
  const supabase = createServiceRoleClient();

  beforeEach(async () => {
    await supabase.from('extension_policy').delete().eq('kind', 'custom');
    await supabase.from('extension_policy').update({ active: false }).eq('kind', 'fixed');
  });

  afterEach(async () => {
    await supabase.from('extension_policy').delete().eq('kind', 'custom');
    await supabase.from('extension_policy').update({ active: false }).eq('kind', 'fixed');
  });

  it('커스텀 확장자를 모두 삭제하고 고정 확장자를 모두 비활성화한 뒤 개수를 반환한다', async () => {
    await supabase.rpc('add_custom_extension', { p_name: 'sh' });
    await supabase.from('extension_policy').update({ active: true }).eq('name', 'exe');

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.deletedCustomCount).toBe(1);
    expect(body.deactivatedFixedCount).toBe(1);

    const { count } = await supabase.from('extension_policy').select('*', { count: 'exact', head: true }).eq('kind', 'custom');
    expect(count).toBe(0);
  });

  it('업로드 최대 크기 정책은 응답에도 DB에도 영향을 주지 않는다', async () => {
    await supabase.from('upload_settings').update({ max_upload_size_bytes: 20971520 }).eq('id', 1);

    await POST();

    const { data } = await supabase.from('upload_settings').select('max_upload_size_bytes').eq('id', 1).single();
    expect(data?.max_upload_size_bytes).toBe(20971520);

    await supabase.from('upload_settings').update({ max_upload_size_bytes: 10485760 }).eq('id', 1);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- app/api/policy/reset/route`
Expected: FAIL, `Cannot find module './route'`

- [ ] **Step 3: 구현**

```typescript
// app/api/policy/reset/route.ts
import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

export async function POST() {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc('reset_extension_policy');

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '초기화에 실패했습니다. 잠시 후 다시 시도해주세요.' } },
      { status: 500 },
    );
  }

  return NextResponse.json({
    deletedCustomCount: data.deleted_custom_count,
    deactivatedFixedCount: data.deactivated_fixed_count,
  });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- app/api/policy/reset/route`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/policy/reset/route.ts app/api/policy/reset/route.test.ts
git commit -m "feat: 확장자 정책 초기화 API 추가"
```

---

## Task 6: 일괄 입력 상태 훅

**Files:**
- Create: `components/useCustomExtensionsBatch.ts`
- Test: `components/useCustomExtensionsBatch.test.ts`

**Interfaces:**
- Consumes: `parseBatchItems`, `splitByComma`, `splitByLine` (`lib/policy/batchParse.ts`, Task 2), API `POST /api/policy/custom-extensions/batch` (Task 4)
- Produces:
  ```typescript
  function useCustomExtensionsBatch(args: {
    onSaveSuccess: (message: string) => void;
    onSaveError: (message: string) => void;
    onResync: () => void;
  }): {
    input: string;
    setInput: (value: string) => void;
    isSubmitting: boolean;
    errorMessage: string | null;
    canSubmit: boolean;
    handleSubmitText: () => void;
    handleImportFile: (file: File) => void;
  }
  ```
  이 반환 타입은 Task 8(`CustomExtensionBatchInput`), Task 9(`ExtignoreControls`)이 그대로 소비한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// components/useCustomExtensionsBatch.test.ts
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useCustomExtensionsBatch } from './useCustomExtensionsBatch';

function setup() {
  const onSaveSuccess = vi.fn();
  const onSaveError = vi.fn();
  const onResync = vi.fn();
  const { result } = renderHook(() => useCustomExtensionsBatch({ onSaveSuccess, onSaveError, onResync }));
  return { result, onSaveSuccess, onSaveError, onResync };
}

describe('useCustomExtensionsBatch', () => {
  it('빈 입력이면 canSubmit이 false다', () => {
    const { result } = setup();
    expect(result.current.canSubmit).toBe(false);
  });

  it('쉼표로 구분한 입력을 제출하면 성공 요약 메시지로 토스트를 호출하고 입력값을 초기화한다', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ added: ['sh', 'bak'], fixedActivated: ['exe'], skippedExistingCount: 0 }), { status: 200 }),
    );
    const { result, onSaveSuccess, onResync } = setup();

    act(() => result.current.setInput('exe,sh,bak'));
    act(() => result.current.handleSubmitText());

    await waitFor(() => expect(onSaveSuccess).toHaveBeenCalledTimes(1));
    expect(onSaveSuccess.mock.calls[0][0]).toContain('2개 등록됨');
    expect(onSaveSuccess.mock.calls[0][0]).toContain('exe 활성화됨');
    expect(onResync).toHaveBeenCalledTimes(1);
    expect(result.current.input).toBe('');
  });

  it('형식 오류 항목이 있으면 API 호출 없이 플랫 목록 오류 메시지를 보여준다', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    fetchSpy.mockClear();
    const { result } = setup();

    act(() => result.current.setInput('exe,my-ext,very-long-extension-name'));
    act(() => result.current.handleSubmitText());

    expect(result.current.errorMessage).toBe('올바르지 않은 항목이 있습니다: my-ext, very-long-extension-name');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('.extignore 파일을 import하면 줄바꿈 기준으로 파싱해 동일한 파이프라인으로 제출한다', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ added: ['out', 'txt'], fixedActivated: [], skippedExistingCount: 0 }), { status: 200 }),
    );
    const { result, onSaveSuccess } = setup();

    const file = new File(['out\ntxt'], '.extignore', { type: 'text/plain' });
    act(() => result.current.handleImportFile(file));

    await waitFor(() => expect(onSaveSuccess).toHaveBeenCalledTimes(1));
    expect(onSaveSuccess.mock.calls[0][0]).toContain('2개 등록됨');
  });

  it('신규 커스텀 0개(기존 중복만 있음)여도 성공 메시지를 보여준다', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ added: [], fixedActivated: [], skippedExistingCount: 2 }), { status: 200 }),
    );
    const { result, onSaveSuccess } = setup();

    act(() => result.current.setInput('sh,bak'));
    act(() => result.current.handleSubmitText());

    await waitFor(() => expect(onSaveSuccess).toHaveBeenCalledTimes(1));
    expect(onSaveSuccess.mock.calls[0][0]).toContain('이미 등록된 2개 제외');
  });

  it('200개 초과 등 기술적 실패는 토스트 콜백으로만 안내한다', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 'LIMIT_EXCEEDED', message: '최대 200개까지 등록할 수 있습니다. 기존 항목을 삭제한 후 다시 추가해주세요.' },
        }),
        { status: 409 },
      ),
    );
    const { result, onSaveError } = setup();

    act(() => result.current.setInput('sh'));
    act(() => result.current.handleSubmitText());

    await waitFor(() => expect(onSaveError).toHaveBeenCalledTimes(1));
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- components/useCustomExtensionsBatch`
Expected: FAIL, `Cannot find module './useCustomExtensionsBatch'`

- [ ] **Step 3: 구현**

```typescript
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
  return parts.join(', ');
}

export function useCustomExtensionsBatch({
  onSaveSuccess,
  onSaveError,
  onResync,
}: {
  onSaveSuccess: (message: string) => void;
  onSaveError: (message: string) => void;
  onResync: () => void;
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
        body: JSON.stringify({ items }),
      });
      const body = await response.json();

      if (!response.ok) {
        if (body.error.code === 'INVALID_ITEMS') {
          setErrorMessage(`올바르지 않은 항목이 있습니다: ${body.error.invalidItems.join(', ')}`);
        } else {
          onSaveError(body.error.message);
        }
        return;
      }

      setInput('');
      onSaveSuccess(buildSummaryMessage(body));
      onResync();
    } catch {
      onSaveError('저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  }

  // 형식 오류는 이 함수에서 즉시 걸러 API 호출 없이 플랫 목록으로 안내한다(설계 문서 2절).
  // 통과하면 서버가 기존 커스텀 중복 제외/고정 확장자 자동 활성화/200개 제한을 최종 처리한다.
  function processRawItems(rawItems: string[]) {
    const result = parseBatchItems(rawItems);

    if (!result.ok) {
      setErrorMessage(`올바르지 않은 항목이 있습니다: ${result.invalidItems.join(', ')}`);
      return;
    }
    if (result.items.length === 0) {
      setErrorMessage('등록할 항목이 없습니다.');
      return;
    }
    setErrorMessage(null);
    submitItems(result.items);
  }

  function handleSubmitText() {
    processRawItems(splitByComma(input));
  }

  // .extignore import는 파일 선택 즉시 파싱/검증해 자동 제출한다(설계 문서 6절) —
  // 일괄 입력 텍스트 영역에 내용을 채워 사용자가 확인하는 중간 단계는 두지 않는다.
  function handleImportFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      processRawItems(splitByLine(text));
    };
    reader.readAsText(file);
  }

  return { input, setInput, isSubmitting, errorMessage, canSubmit, handleSubmitText, handleImportFile };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- components/useCustomExtensionsBatch`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/useCustomExtensionsBatch.ts components/useCustomExtensionsBatch.test.ts
git commit -m "feat: 일괄 입력/.extignore import 상태 훅 추가"
```

---

## Task 7: 모드 전환 컴포넌트

**Files:**
- Create: `components/CustomExtensionModeToggle.tsx`
- Test: `components/CustomExtensionModeToggle.test.tsx`

**Interfaces:**
- Produces: `function CustomExtensionModeToggle(props: { mode: 'single' | 'batch'; onModeChange: (mode: 'single' | 'batch') => void }): JSX.Element` — Task 12(`app/page.tsx`)가 소비

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// components/CustomExtensionModeToggle.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomExtensionModeToggle } from './CustomExtensionModeToggle';

describe('CustomExtensionModeToggle', () => {
  it('현재 모드 버튼에 aria-checked=true를 표시한다', () => {
    render(<CustomExtensionModeToggle mode="single" onModeChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: '단일 입력' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '일괄 입력' })).toHaveAttribute('aria-checked', 'false');
  });

  it('다른 모드를 클릭하면 onModeChange를 호출한다', async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    render(<CustomExtensionModeToggle mode="single" onModeChange={onModeChange} />);

    await user.click(screen.getByRole('radio', { name: '일괄 입력' }));

    expect(onModeChange).toHaveBeenCalledWith('batch');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- components/CustomExtensionModeToggle`
Expected: FAIL, `Cannot find module './CustomExtensionModeToggle'`

- [ ] **Step 3: 구현**

```tsx
// components/CustomExtensionModeToggle.tsx
'use client';

const MODES = [
  { value: 'single', label: '단일 입력' },
  { value: 'batch', label: '일괄 입력' },
] as const;

export function CustomExtensionModeToggle({
  mode,
  onModeChange,
}: {
  mode: 'single' | 'batch';
  onModeChange: (mode: 'single' | 'batch') => void;
}) {
  return (
    <div role="radiogroup" aria-label="커스텀 확장자 입력 방식" className="inline-flex rounded-md border border-gray-300 dark:border-gray-700">
      {MODES.map((option, index) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={mode === option.value}
          onClick={() => onModeChange(option.value)}
          className={`px-3 py-1.5 text-sm font-medium ${index === 0 ? 'rounded-l-md' : 'rounded-r-md'} ${
            mode === option.value
              ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
              : 'bg-white text-gray-700 hover:bg-gray-100 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-800'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- components/CustomExtensionModeToggle`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/CustomExtensionModeToggle.tsx components/CustomExtensionModeToggle.test.tsx
git commit -m "feat: 커스텀 확장자 단일/일괄 모드 전환 컴포넌트 추가"
```

---

## Task 8: 일괄 입력 UI 컴포넌트

**Files:**
- Create: `components/CustomExtensionBatchInput.tsx`
- Test: `components/CustomExtensionBatchInput.test.tsx`

**Interfaces:**
- Consumes: `useCustomExtensionsBatch`의 반환 타입(Task 6) — `input`, `setInput`, `isSubmitting`, `errorMessage`, `canSubmit`, `handleSubmitText`
- Produces: `function CustomExtensionBatchInput(props): JSX.Element` — Task 12가 소비

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// components/CustomExtensionBatchInput.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomExtensionBatchInput } from './CustomExtensionBatchInput';

function renderInput(overrides: Partial<Parameters<typeof CustomExtensionBatchInput>[0]> = {}) {
  const props = {
    input: '',
    setInput: vi.fn(),
    isSubmitting: false,
    errorMessage: null,
    canSubmit: false,
    handleSubmitText: vi.fn(),
    ...overrides,
  };
  render(<CustomExtensionBatchInput {...props} />);
  return props;
}

describe('CustomExtensionBatchInput', () => {
  it('입력이 없으면 등록 버튼이 비활성화된다', () => {
    renderInput({ canSubmit: false });
    expect(screen.getByRole('button', { name: '일괄 등록' })).toBeDisabled();
  });

  it('canSubmit이 true일 때 등록 버튼을 누르면 handleSubmitText를 호출한다', async () => {
    const user = userEvent.setup();
    const props = renderInput({ input: 'exe,pdf', canSubmit: true });

    await user.click(screen.getByRole('button', { name: '일괄 등록' }));

    expect(props.handleSubmitText).toHaveBeenCalledTimes(1);
  });

  it('제출 중에는 버튼 문구가 등록 중...으로 바뀌고 비활성화된다', () => {
    renderInput({ input: 'exe', canSubmit: false, isSubmitting: true });
    expect(screen.getByRole('button', { name: '등록 중...' })).toBeDisabled();
  });

  it('errorMessage가 있으면 플랫 목록 문구를 그대로 표시한다', () => {
    renderInput({ errorMessage: '올바르지 않은 항목이 있습니다: my-ext, 안녕' });
    expect(screen.getByRole('alert')).toHaveTextContent('올바르지 않은 항목이 있습니다: my-ext, 안녕');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- components/CustomExtensionBatchInput`
Expected: FAIL, `Cannot find module './CustomExtensionBatchInput'`

- [ ] **Step 3: 구현**

```tsx
// components/CustomExtensionBatchInput.tsx
'use client';

export function CustomExtensionBatchInput({
  input,
  setInput,
  isSubmitting,
  errorMessage,
  canSubmit,
  handleSubmitText,
}: {
  input: string;
  setInput: (value: string) => void;
  isSubmitting: boolean;
  errorMessage: string | null;
  canSubmit: boolean;
  handleSubmitText: () => void;
}) {
  return (
    <div>
      <form
        className="space-y-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) handleSubmitText();
        }}
      >
        <label htmlFor="custom-extension-batch-input" className="block text-sm font-medium text-gray-900 dark:text-gray-100">
          일괄 입력(쉼표로 구분, 예: exe,pdf,tar.gz)
        </label>
        <textarea
          id="custom-extension-batch-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={3}
          className="block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
        />
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center justify-center rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300 dark:disabled:bg-gray-700 dark:disabled:text-gray-400"
        >
          {isSubmitting ? '등록 중...' : '일괄 등록'}
        </button>
      </form>
      <div className="min-h-5 mt-1">
        {errorMessage && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- components/CustomExtensionBatchInput`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/CustomExtensionBatchInput.tsx components/CustomExtensionBatchInput.test.tsx
git commit -m "feat: 일괄 입력 텍스트 영역 컴포넌트 추가"
```

---

## Task 9: .extignore import/export 컴포넌트

**Files:**
- Create: `components/ExtignoreControls.tsx`
- Test: `components/ExtignoreControls.test.tsx`

**Interfaces:**
- Consumes: `buildExtignoreContent`, `ExtignorePolicyInput` (`lib/policy/extignore.ts`, Task 3)
- Produces: `function ExtignoreControls(props: { policy: ExtignorePolicyInput; onImportFile: (file: File) => void; isSubmitting: boolean }): JSX.Element` — Task 12가 소비

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// components/ExtignoreControls.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExtignoreControls } from './ExtignoreControls';

const policy = {
  fixedExtensions: [{ name: 'exe', active: true }],
  customExtensions: [{ name: 'sh' }],
};

describe('ExtignoreControls', () => {
  it('파일을 선택하면 onImportFile을 호출한다', async () => {
    const user = userEvent.setup();
    const onImportFile = vi.fn();
    render(<ExtignoreControls policy={policy} onImportFile={onImportFile} isSubmitting={false} />);

    const file = new File(['out\ntxt'], '.extignore', { type: 'text/plain' });
    const input = screen.getByLabelText('.extignore 파일 선택', { selector: 'input' });
    await user.upload(input, file);

    expect(onImportFile).toHaveBeenCalledWith(file);
  });

  it('내보내기 버튼을 누르면 다운로드를 트리거한다', async () => {
    const user = userEvent.setup();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<ExtignoreControls policy={policy} onImportFile={vi.fn()} isSubmitting={false} />);
    await user.click(screen.getByRole('button', { name: '.extignore 내보내기' }));

    expect(clickSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });

  it('isSubmitting이 true면 가져오기 버튼이 비활성화된다', () => {
    render(<ExtignoreControls policy={policy} onImportFile={vi.fn()} isSubmitting={true} />);
    expect(screen.getByRole('button', { name: '.extignore 가져오기' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- components/ExtignoreControls`
Expected: FAIL, `Cannot find module './ExtignoreControls'`

- [ ] **Step 3: 구현**

```tsx
// components/ExtignoreControls.tsx
'use client';

import { useRef } from 'react';
import { buildExtignoreContent, ExtignorePolicyInput } from '@/lib/policy/extignore';

export function ExtignoreControls({
  policy,
  onImportFile,
  isSubmitting,
}: {
  policy: ExtignorePolicyInput;
  onImportFile: (file: File) => void;
  isSubmitting: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      onImportFile(file);
    }
    // 같은 파일을 다시 선택해도 onChange가 재발생하도록 값을 비운다.
    event.target.value = '';
  }

  function handleExport() {
    const content = buildExtignoreContent(policy);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '.extignore';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isSubmitting}
        className="inline-flex items-center justify-center rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        .extignore 가져오기
      </button>
      <input
        ref={fileInputRef}
        type="file"
        aria-label=".extignore 파일 선택"
        accept=".extignore,text/plain"
        onChange={handleFileChange}
        className="sr-only"
      />
      <button
        type="button"
        onClick={handleExport}
        className="inline-flex items-center justify-center rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        .extignore 내보내기
      </button>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- components/ExtignoreControls`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/ExtignoreControls.tsx components/ExtignoreControls.test.tsx
git commit -m "feat: .extignore import/export 컴포넌트 추가"
```

---

## Task 10: 정책 초기화 버튼

**Files:**
- Create: `components/ResetPolicyButton.tsx`
- Test: `components/ResetPolicyButton.test.tsx`

**Interfaces:**
- Produces: `function ResetPolicyButton(props: { disabled: boolean; onSaveSuccess: (message: string) => void; onSaveError: (message: string) => void; onResync: () => void }): JSX.Element` — Task 12가 소비

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// components/ResetPolicyButton.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResetPolicyButton } from './ResetPolicyButton';

function renderButton(overrides: Partial<Parameters<typeof ResetPolicyButton>[0]> = {}) {
  const props = {
    disabled: false,
    onSaveSuccess: vi.fn(),
    onSaveError: vi.fn(),
    onResync: vi.fn(),
    ...overrides,
  };
  render(<ResetPolicyButton {...props} />);
  return props;
}

describe('ResetPolicyButton', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('disabled가 true면 버튼이 비활성화된다', () => {
    renderButton({ disabled: true });
    expect(screen.getByRole('button', { name: '확장자 정책 초기화' })).toBeDisabled();
  });

  it('확인 대화상자에서 취소하면 요청을 보내지 않는다', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const fetchSpy = vi.spyOn(global, 'fetch');
    fetchSpy.mockClear();

    renderButton();
    await user.click(screen.getByRole('button', { name: '확장자 정책 초기화' }));

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('확인하면 초기화 API를 호출하고 성공 시 재조회와 성공 토스트를 호출한다', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ deletedCustomCount: 2, deactivatedFixedCount: 1 }), { status: 200 }),
    );
    const { onSaveSuccess, onResync } = renderButton();

    await user.click(screen.getByRole('button', { name: '확장자 정책 초기화' }));

    expect(await screen.findByRole('button', { name: '확장자 정책 초기화' })).not.toBeDisabled();
    expect(onSaveSuccess).toHaveBeenCalledTimes(1);
    expect(onResync).toHaveBeenCalledTimes(1);
  });

  it('실패하면 오류 토스트만 호출하고 재조회하지 않는다', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));
    const { onSaveError, onResync } = renderButton();

    await user.click(screen.getByRole('button', { name: '확장자 정책 초기화' }));

    await vi.waitFor(() => expect(onSaveError).toHaveBeenCalledTimes(1));
    expect(onResync).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- components/ResetPolicyButton`
Expected: FAIL, `Cannot find module './ResetPolicyButton'`

- [ ] **Step 3: 구현**

```tsx
// components/ResetPolicyButton.tsx
'use client';

import { useState } from 'react';

export function ResetPolicyButton({
  disabled,
  onSaveSuccess,
  onSaveError,
  onResync,
}: {
  disabled: boolean;
  onSaveSuccess: (message: string) => void;
  onSaveError: (message: string) => void;
  onResync: () => void;
}) {
  const [isResetting, setIsResetting] = useState(false);

  async function handleReset() {
    const confirmed = window.confirm('커스텀 확장자를 모두 삭제하고 고정 확장자를 모두 비활성화합니다. 계속할까요?');
    if (!confirmed) return;

    setIsResetting(true);
    try {
      const response = await fetch('/api/policy/reset', { method: 'POST' });
      if (response.ok) {
        onSaveSuccess('확장자 정책이 초기화되었습니다.');
        onResync();
      } else {
        onSaveError('초기화에 실패했습니다. 잠시 후 다시 시도해주세요.');
      }
    } catch {
      onSaveError('초기화 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleReset}
      disabled={disabled || isResetting}
      className="inline-flex items-center justify-center rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950 dark:disabled:border-gray-800 dark:disabled:text-gray-600"
    >
      확장자 정책 초기화
    </button>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- components/ResetPolicyButton`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/ResetPolicyButton.tsx components/ResetPolicyButton.test.tsx
git commit -m "feat: 확장자 정책 초기화 버튼 추가"
```

---

## Task 11: FixedExtensionsSection의 진행 상태 보고

**Files:**
- Modify: `components/FixedExtensionsSection.tsx`
- Modify: `components/FixedExtensionsSection.test.tsx`

**Interfaces:**
- Produces: `FixedExtensionsSection`에 선택적 prop `onPendingChange?: (pending: boolean) => void` 추가 — `savingNames.size > 0 || unsavedNames.size > 0`일 때 `true`. Task 12(`app/page.tsx`)가 이 콜백으로 `ResetPolicyButton`의 `disabled`를 계산한다.
- 기존 시그니처(`extensions`, `onSaveSuccess`, `onSaveError`, `onResync`)는 그대로 유지되므로 이 prop을 넘기지 않는 기존 호출부/테스트는 수정할 필요가 없다.

- [ ] **Step 1: 실패하는 테스트 추가**(기존 `components/FixedExtensionsSection.test.tsx` 끝에 추가)

```typescript
  it('debounce 대기 중이거나 저장 중이면 onPendingChange(true)를 호출하고, 저장이 끝나면 false로 되돌린다', async () => {
    vi.useFakeTimers();
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ name: 'exe', active: true })));
    const onPendingChange = vi.fn();

    render(
      <FixedExtensionsSection
        extensions={[{ name: 'exe', active: false }]}
        onSaveSuccess={vi.fn()}
        onSaveError={vi.fn()}
        onResync={vi.fn()}
        onPendingChange={onPendingChange}
      />,
    );

    fireEvent.click(screen.getByLabelText('exe'));
    expect(onPendingChange).toHaveBeenLastCalledWith(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(onPendingChange).toHaveBeenLastCalledWith(false);
    vi.useRealTimers();
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- components/FixedExtensionsSection`
Expected: FAIL, `onPendingChange` 호출 이력이 비어 있거나 `undefined`

- [ ] **Step 3: 구현**(`components/FixedExtensionsSection.tsx` 수정)

```tsx
export function FixedExtensionsSection({
  extensions,
  onSaveSuccess,
  onSaveError,
  onResync,
  onPendingChange,
}: {
  extensions: FixedExtension[];
  onSaveSuccess: (message: string) => void;
  onSaveError: (message: string) => void;
  onResync: () => void;
  onPendingChange?: (pending: boolean) => void;
}) {
```

`useEffect` import 아래, 기존 `unsavedNamesRef` 동기화 effect 다음에 추가한다.

```tsx
  useEffect(() => {
    onPendingChange?.(savingNames.size > 0 || unsavedNames.size > 0);
  }, [savingNames, unsavedNames, onPendingChange]);
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- components/FixedExtensionsSection`
Expected: PASS(새 테스트 포함, 기존 테스트도 계속 통과 — `onPendingChange`가 선택적이므로 기존 렌더 호출은 영향받지 않음)

- [ ] **Step 5: Commit**

```bash
git add components/FixedExtensionsSection.tsx components/FixedExtensionsSection.test.tsx
git commit -m "feat: 고정 확장자 섹션의 저장 진행 상태를 상위로 보고"
```

---

## Task 12: app/page.tsx 조립

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/page.test.tsx`

**Interfaces:**
- Consumes: 이 계획의 모든 이전 태스크(`useCustomExtensionsBatch`, `CustomExtensionModeToggle`, `CustomExtensionBatchInput`, `ExtignoreControls`, `ResetPolicyButton`, `FixedExtensionsSection`의 `onPendingChange`)

- [ ] **Step 1: 실패하는 테스트 추가**(기존 `app/page.test.tsx` 끝에 추가)

```typescript
  it('일괄 입력 모드로 전환하면 단일 입력이 사라지고 일괄 입력 영역과 .extignore 버튼이 나타난다', async () => {
    const user = userEvent.setup();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ fixedExtensions: [{ name: 'exe', active: false }], customExtensions: [], maxUploadSizeBytes: 10485760 }),
      ),
    );

    render(<Page />);
    await screen.findByLabelText('커스텀 확장자 입력');

    await user.click(screen.getByRole('radio', { name: '일괄 입력' }));

    expect(screen.queryByLabelText('커스텀 확장자 입력')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/일괄 입력\(쉼표로 구분/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '.extignore 내보내기' })).toBeInTheDocument();
  });

  it('모드를 전환하면 입력값이 초기화된다', async () => {
    const user = userEvent.setup();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ fixedExtensions: [{ name: 'exe', active: false }], customExtensions: [], maxUploadSizeBytes: 10485760 }),
      ),
    );

    render(<Page />);
    const singleInput = await screen.findByLabelText('커스텀 확장자 입력');
    await user.type(singleInput, 'sh');

    await user.click(screen.getByRole('radio', { name: '일괄 입력' }));
    await user.click(screen.getByRole('radio', { name: '단일 입력' }));

    expect(await screen.findByLabelText('커스텀 확장자 입력')).toHaveValue('');
  });

  it('고정 확장자 저장이 진행 중이면 초기화 버튼이 비활성화되고, 저장이 끝나면 다시 활성화된다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ delay: null });
    vi.spyOn(global, 'fetch').mockImplementation((input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/policy') {
        return Promise.resolve(
          new Response(
            JSON.stringify({ fixedExtensions: [{ name: 'exe', active: false }], customExtensions: [], maxUploadSizeBytes: 10485760 }),
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ name: 'exe', active: true })));
    });

    render(<Page />);
    await screen.findByLabelText('exe');

    expect(screen.getByRole('button', { name: '확장자 정책 초기화' })).not.toBeDisabled();

    await user.click(screen.getByLabelText('exe'));
    expect(screen.getByRole('button', { name: '확장자 정책 초기화' })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.getByRole('button', { name: '확장자 정책 초기화' })).not.toBeDisabled();
    vi.useRealTimers();
  });
```

이 파일 상단에 `act`를 추가로 import해야 한다: `import { act, render, screen } from '@testing-library/react';`

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- app/page`
Expected: FAIL, `Unable to find role="radio"` 등 새 컴포넌트가 아직 조립되지 않아 발생하는 오류

- [ ] **Step 3: 구현**(`app/page.tsx` 수정)

`import` 블록에 추가:

```tsx
import { useState } from 'react';
import { useCustomExtensionsBatch } from '@/components/useCustomExtensionsBatch';
import { CustomExtensionModeToggle } from '@/components/CustomExtensionModeToggle';
import { CustomExtensionBatchInput } from '@/components/CustomExtensionBatchInput';
import { ExtignoreControls } from '@/components/ExtignoreControls';
import { ResetPolicyButton } from '@/components/ResetPolicyButton';
```

`export default function Page()` 내부, 기존 `customExtensions` 선언 다음에 추가:

```tsx
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [fixedExtensionsPending, setFixedExtensionsPending] = useState(false);
  const customExtensionsBatch = useCustomExtensionsBatch({
    onSaveSuccess: showSuccess,
    onSaveError: showError,
    onResync: refetch,
  });

  const isAnySectionPending =
    fixedExtensionsPending ||
    customExtensions.isSubmitting ||
    customExtensions.deletingIds.size > 0 ||
    customExtensionsBatch.isSubmitting;

  function handleModeChange(nextMode: 'single' | 'batch') {
    customExtensions.setInput('');
    customExtensionsBatch.setInput('');
    setMode(nextMode);
  }
```

`<CustomExtensionInput {...customExtensions} />` 줄을 다음으로 교체한다(같은 위치, `FixedExtensionsSection` 앞):

```tsx
            <CustomExtensionModeToggle mode={mode} onModeChange={handleModeChange} />
            {mode === 'single' ? (
              <CustomExtensionInput {...customExtensions} />
            ) : (
              <CustomExtensionBatchInput {...customExtensionsBatch} />
            )}
            <ExtignoreControls
              policy={policy}
              onImportFile={customExtensionsBatch.handleImportFile}
              isSubmitting={customExtensionsBatch.isSubmitting}
            />
```

기존 `<FixedExtensionsSection ... />` 호출에 `onPendingChange` prop을 추가한다:

```tsx
            <FixedExtensionsSection
              extensions={policy.fixedExtensions}
              onSaveSuccess={showSuccess}
              onSaveError={showError}
              onResync={refetch}
              onPendingChange={setFixedExtensionsPending}
            />
```

`<CustomExtensionList {...customExtensions} />` 다음 줄에 `ResetPolicyButton`을 추가한다(같은 `div`(확장자 카드) 안, 목록 아래):

```tsx
            <CustomExtensionList {...customExtensions} />
            <ResetPolicyButton
              disabled={isAnySectionPending}
              onSaveSuccess={showSuccess}
              onSaveError={showError}
              onResync={refetch}
            />
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- app/page`
Expected: PASS(새 테스트와 기존 테스트 모두)

전체 스위트도 함께 확인한다.

Run: `npm test`
Expected: PASS(전체)

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx app/page.test.tsx
git commit -m "feat: 화면에 일괄 입력, .extignore, 정책 초기화 조립"
```

---

## Task 13: REQUIREMENTS.md / PLANNING.md / DESIGN.md / CONSIDERATIONS.md 반영

**Files:**
- Modify: `docs/specs/REQUIREMENTS.md`
- Modify: `docs/specs/PLANNING.md`
- Modify: `docs/specs/DESIGN.md`
- Modify: `docs/CONSIDERATIONS.md`

이 태스크는 코드가 아니라 문서 반영이므로 TDD 단계 없이 다음 순서로 진행한다.

- [ ] **Step 1: REQUIREMENTS.md 갱신**

"커스텀 확장자" 절 근처에 다음 내용을 실제 구현/테스트 결과와 대조하며 추가한다(기존 문서 형식 — 결정/적용 방향/판단 이유/예시 표 — 을 그대로 따른다).

- 일괄 입력 모드(단일/일괄 전환, 쉼표 구분, 항목별 20자 제한)
- `.extignore` import(줄 단위, 주석/glob 미지원)/export(활성 고정 알파벳순 → 커스텀 알파벳순)
- 확장자 정책 초기화(커스텀 전체 삭제, 고정 전체 비활성화, 업로드 크기 제외)
- 배치의 기존 커스텀 중복 처리가 단일 모드와 다르다는 점(조용히 제외, 오류 아님)과 판단 이유

"4. 검증 체크리스트"에 실제 테스트로 확인한 항목만 `[x]`로 새 절을 추가한다(예: "일괄 입력과 .extignore").

- [ ] **Step 2: PLANNING.md 갱신**

5.2절(커스텀 확장자 섹션)에 모드 전환 UI, 일괄 입력 상태 흐름(성공 요약 토스트만, 개별 포커스 이동 없음), import 즉시 제출, export 흐름, 초기화 버튼(확인 대화상자, 다른 영역 진행 중 비활성화)을 추가한다. 12절(요구사항과 화면 간 추적 관계) 표에도 새 요구사항 행을 추가한다.

- [ ] **Step 3: DESIGN.md 갱신**

4.1절(엔드포인트 목록)에 `POST /api/policy/custom-extensions/batch`, `POST /api/policy/reset`을 추가한다. 5.2절(커스텀 확장자 추가 RPC) 근처에 배치 RPC와 초기화 RPC를 같은 방식(advisory lock 키 공유, 원자성)으로 설명하는 절을 추가한다. 7절(테스트 전략)에 배치/초기화 통합 테스트 항목을 추가한다.

- [ ] **Step 4: CONSIDERATIONS.md 갱신**

"3-2. 정책/데이터 관점" 근처에 이번 설계에서 발견한 항목들을 기존 형식(원문 인용 없이 이번엔 자체 발견 항목이므로 "판단"과 "반영 내용"만)으로 추가한다.

- 확장자 정책 초기화의 범위(업로드 크기 정책은 제외)
- 일괄/단일 모드의 기존 커스텀 중복 처리 비대칭과 그 이유
- 배치 RPC와 단일 RPC의 advisory lock 공유 필요성
- 부분 실패 시 오류 표시 수준(사유 구분 없는 플랫 목록)
- `.extignore`라는 이름이 유발하는 기대(주석/glob)와 실제 지원 범위의 차이
- 배치로 여러 고정 확장자가 자동 활성화될 때 포커스 이동 대신 요약 안내로 처리한 이유

- [ ] **Step 5: document-review 실행**

`document-review` 스킬을 호출해 위 4개 문서의 문체, 형식, 용어와 현재 구현 상태의 정합성을 검토하고 지적 사항을 반영한다.

- [ ] **Step 6: Commit**

```bash
git add docs/specs/REQUIREMENTS.md docs/specs/PLANNING.md docs/specs/DESIGN.md docs/CONSIDERATIONS.md
git commit -m "docs: 일괄 입력, .extignore, 정책 초기화 문서 반영"
```

---

## Task 14: prompt-log 기록

**Files:**
- Modify: `docs/ai/PROMPT_LOG.md`
- Commit(신규, 아직 git에 반영되지 않음): `docs/superpowers/specs/2026-08-01-custom-extension-batch-extignore-design.md`

- [ ] **Step 1: `prompt-log` 스킬 실행**

이 기능 브레인스토밍부터 구현까지의 작업 단위를 요약하고, 발견한 추가 고려사항(초기화 범위, 배치/단일 중복 처리 비대칭, lock 공유, 오류 표시 수준, import 자동 제출, `.extignore` 네이밍, 배치 자동 활성화 포커스 처리)을 AI 활용 과정으로 기록한다. 중립적인 회고 질문을 생성하고, 사용자가 직접 판단과 회고를 작성한 뒤 확정한다.

- [ ] **Step 2: Commit**

브레인스토밍 단계에서 작성된 설계 문서(`docs/superpowers/specs/2026-08-01-custom-extension-batch-extignore-design.md`)는 지금까지 커밋되지 않고 워킹 트리에만 존재한다. 구현과 문서 반영이 모두 끝난 이 시점에 함께 커밋한다(브레인스토밍 리뷰 시 확정된 순서).

```bash
git add docs/ai/PROMPT_LOG.md docs/superpowers/specs/2026-08-01-custom-extension-batch-extignore-design.md
git commit -m "docs: 일괄 입력/.extignore/정책 초기화 프롬프트 로그와 설계 문서 반영"
```

---

## 완료 조건

- [ ] `npm test` 전체 통과(마이그레이션 적용 후, `npx supabase migration up` 선행)
- [ ] `npm run lint` 통과
- [ ] `REQUIREMENTS.md`, `PLANNING.md`, `DESIGN.md`, `CONSIDERATIONS.md`가 실제 구현과 일치
- [ ] `PROMPT_LOG.md`에 이번 작업 로그가 사용자 회고까지 포함해 확정됨
- [ ] 브라우저에서 실제로 단일→일괄 전환, 일괄 등록, `.extignore` import/export, 정책 초기화를 수동으로 확인(자동화 테스트로 검증하기 어려운 파일 다운로드 트리거 등)
