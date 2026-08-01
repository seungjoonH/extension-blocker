# 업로드 파일 목록 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DB에 저장된 업로드를 누구나 조회·다운로드하고, 보호 시드 외에는 누구나 삭제할 수 있는 목록 UI를 추가한다.

**Architecture:** `uploads.is_protected`와 service_role `select`를 추가한 뒤, Next.js API(`GET` 목록, `GET` 다운로드, `DELETE`)로 스토리지와 메타데이터를 다룬다. 보호 시드 4개는 고정 UUID로 idempotent seed한다. 업로드 카드 아래 목록 컴포넌트가 성공/삭제 후 refetch한다.

**Tech Stack:** Next.js App Router, Supabase (Postgres + Storage), Vitest, React Testing Library

## Global Constraints

- 인증 없음: 목록·다운로드·삭제(비보호)는 공개
- 보호 시드는 UI에 “고정” 문구 없이 삭제만 불가
- 파일 크기 표시는 `formatFileSizeMb` (`#.#MB`)
- Conventional Commits, 명시 요청 전 커밋 금지
- Markdown 변경 후 document-review, 의미 있는 작업 후 prompt-log

---

## Task 1: DB 마이그레이션 (`is_protected` + select)

**Files:**
- Create: `supabase/migrations/0007_uploads_list_protected.sql`
- Create: `supabase/migrations/0007_uploads_list_protected.test.ts`

- [ ] Step 1: `is_protected boolean not null default false` 추가, `grant select on uploads to service_role`
- [ ] Step 2: 마이그레이션 테스트 작성·통과
- [ ] Step 3: 로컬 DB에 마이그레이션 적용

## Task 2: 시드 콘텐츠와 idempotent seed 헬퍼

**Files:**
- Create: `content/seed-uploads/guideline.md`
- Create: `content/seed-uploads/extignore.valid-200.txt` (생성 스크립트 또는 정적 생성)
- Create: `content/seed-uploads/extignore.limit-201.txt`
- Create: `content/seed-uploads/extignore.invalid-chars.txt`
- Create: `lib/upload/seedProtectedUploads.ts`
- Create: `lib/upload/seedProtectedUploads.test.ts`

- [ ] Step 1: guideline에 세 샘플 용도 설명
- [ ] Step 2: valid-200 / limit-201 / invalid-chars 내용 생성(고정 확장자명 제외한 `c001`… 형태)
- [ ] Step 3: 고정 UUID로 storage+DB upsert하는 `ensureProtectedUploads()` 구현·테스트

## Task 3: 목록·다운로드·삭제 API

**Files:**
- Modify: `app/api/uploads/route.ts` (GET 추가, 기존 POST 유지)
- Create: `app/api/uploads/[id]/route.ts` (DELETE)
- Create: `app/api/uploads/[id]/download/route.ts` (GET)
- Create: 대응 `*.test.ts`

- [ ] Step 1: GET 목록 — seed 보장 후 최신순 JSON
- [ ] Step 2: GET download — 원본 파일명으로 attachment 스트리밍
- [ ] Step 3: DELETE — 보호면 403, 아니면 storage+row 삭제
- [ ] Step 4: 테스트 통과

## Task 4: 목록 UI

**Files:**
- Create: `components/UploadedFilesList.tsx`
- Create: `components/UploadedFilesList.test.tsx`
- Modify: `app/page.tsx` (업로드 섹션 아래 배치, 업로드 성공 시 refetch 연결)

- [ ] Step 1: 목록·다운로드·삭제 UI + 보호 시 삭제 비활성
- [ ] Step 2: page에 조립, 업로드 성공 후 갱신
- [ ] Step 3: 컴포넌트/페이지 테스트

## Task 5: 문서 반영

**Files:**
- Modify: `docs/specs/REQUIREMENTS.md`
- Modify: `docs/specs/PLANNING.md`
- Modify: `docs/CONSIDERATIONS.md`
- Modify: `docs/ai/PROMPT_LOG.md`

- [ ] Step 1: 목록 공개로 정책 변경·판단 근거 기록
- [ ] Step 2: 체크리스트 갱신
- [ ] Step 3: document-review + prompt-log
