---
name: context7
description: 라이브러리 API, 설정, 버전별 동작을 Context7 MCP로 공식 문서 기준 확인할 때 사용. Next.js, Supabase, clamscan, Vitest 등. docs/specs/ 요구사항과 정책 결정에는 사용하지 않는다.
---

# Context7

[`docs/ai/AI_WORKFLOW.md`](../../docs/ai/AI_WORKFLOW.md)의 Context7 규칙을 따른다.

## 사용하는 경우

- 라이브러리 API, 설정, 버전별 동작 확인
- training data와 실제 버전 간 차이가 의심될 때

## 사용하지 않는 경우

- `docs/specs/REQUIREMENTS.md`의 `결정 필요` 항목 결정
- 제품 정책, 보안 정책, UX 정책 invent
- 과제 고려사항의 구현 여부 판단

## MCP 호출

Context7 MCP 도구가 연결되어 있어야 한다. `.cursor/mcp.json` 또는 전역 MCP 설정.

### 1. Resolve Library ID

`resolve-library-id` with:

- `libraryName`: 라이브러리 이름
- `query`: 문서에서 찾을 내용

### 2. Query Docs

`query-docs` with:

- `libraryId`: 선택한 ID (예: `/vercel/next.js`)
- `query`: **단일 개념** 단위로 조회

여러 개념은 library ID를 한 번 resolve한 뒤 `query-docs`를 개념별로 나눠 호출한다.

### 3. 반영

공식 문서 기준으로 코드와 설정을 작성한다. training data만으로 API를 추측하지 않는다.

## 이 프로젝트에서 자주 쓰는 후보

- Next.js App Router, Route Handlers
- `@supabase/supabase-js`
- `clamscan` (NodeClam)
- Vitest, Testing Library

## API Key

`.env`에 `CONTEXT7_API_KEY`를 넣는다. `.env.example`을 복사해 사용한다.

```bash
cp .env.example .env
# .env에 key 입력
```

Cursor MCP는 `.cursor/mcp.json`의 `envFile: "${workspaceFolder}/.env"`로 로드한다. key는 mcp.json이나 git에 넣지 않는다.

rate limit에 걸리면 [context7.com/dashboard](https://context7.com/dashboard)에서 API key를 발급한다.
