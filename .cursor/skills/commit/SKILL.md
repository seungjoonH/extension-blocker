---
name: commit
description: 검증이 끝난 변경사항을 Conventional Commits 형식으로 커밋한다. /commit, commit-push-pr, commit-commands 대체. 커밋해줘, 변경사항 커밋 요청 시 반드시 사용. 명시적 요청 없이는 실행하지 않는다.
---

# Commit

Claude Code `commit-commands`의 `/commit`과 동일한 역할을 한다. [`docs/ai/AI_WORKFLOW.md`](../../docs/ai/AI_WORKFLOW.md) 워크플로 마지막 단계에서 사용한다.

## 사전 조건

- 테스트, document-review, prompt-log 등 해당 작업의 검증과 기록이 완료됨
- 사용자가 **명시적으로 커밋을 요청**함

## 절차

다음 shell 명령을 **병렬**로 실행한다.

1. `git status` — untracked 파일 확인
2. `git diff` — staged/unstaged 변경 확인
3. `git log` — 최근 커밋 메시지 스타일 확인

### 분석

- Conventional Commits 형식, 설명은 **한국어**
- `.env`, credentials.json 등 **민감 파일은 커밋하지 않음**. stage 후보에 있으면 경고
- 변경 목적(why) 중심의 1~2문장 메시지

### 실행 (순차)

1. 관련 untracked 파일을 staging area에 추가
2. HEREDOC으로 커밋 메시지 전달:

```bash
git commit -m "$(cat <<'EOF'
type: 한국어 설명

EOF
)"
```

3. `git status`로 커밋 성공 확인

## PR 생성 (별도 요청 시)

`/commit-push-pr` 대응. 사용자가 PR 생성을 명시 요청했을 때만:

1. `git status`, `git diff`, remote 추적 상태, `git log`, `git diff [base]...HEAD` 병렬 확인
2. 필요 시 `git push -u origin HEAD`
3. `gh pr create` with Summary, Test plan

## 금지

- 명시적 커밋 요청 없이 `git commit` 실행
- 명시적 push/PR 요청 없이 push 또는 PR 생성
- pre-commit hook 우회 (`--no-verify`) — 사용자가 명시할 때만
- hook 실패 시 `git commit --amend` — 새 커밋으로 수정
- `git config` 변경
- destructive git 명령 (force push 등) — 사용자 명시 요청 없이

## 관련 문서

- [`CLAUDE.md`](../../CLAUDE.md), [`AGENTS.md`](../../AGENTS.md) — 커밋과 push 승인 원칙
