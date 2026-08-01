# Project Instructions

- 복잡한 기능은 요구사항과 정책을 합의하고 계획을 작성한 뒤 구현한다
- 미정의 사항과 문서 간 충돌을 임의로 확정하지 않는다
- 최신 라이브러리의 API, 설정 또는 버전별 동작을 확인할 때만 Context7을 사용한다
- Markdown 문서가 변경되면 `document-review` skill을 실행한다 (`/document-review`)
- 의미 있는 AI 작업이 끝나면 `prompt-log` skill로 작업 내역과 AI 활용 내용을 요약하고, 사용자가 판단과 회고를 직접 작성한 뒤 `PROMPT_LOG.md`에 확정한다 (`/prompt-log`)
- 테스트, 문서 검토와 AI 활용 기록이 완료된 변경만 커밋한다
- 커밋 메시지는 Conventional Commits 형식을 사용하고 설명은 한국어로 작성한다
- 사용자의 명시적인 요청 없이 커밋, push 또는 Pull Request 생성을 수행하지 않는다

상세 작업 흐름은 [`docs/ai/AI_WORKFLOW.md`](docs/ai/AI_WORKFLOW.md)를 따른다.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
