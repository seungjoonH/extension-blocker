---
name: using-project-skills
description: Use when starting any conversation or before any action. Mandatory skill routing for this project. Read the relevant SKILL.md before ANY response, tool call, or clarifying question.
---

# Using Project Skills

Cursor equivalent of Claude Code Superpowers `using-superpowers` plus this project's skill workflow.

## The Rule

**Invoke relevant or requested skills BEFORE any response or action.**

If a skill might apply (even 1% chance), Read its `SKILL.md` first.

Announce `Using [skill] to [purpose]` and follow the skill exactly.

## Priority

1. Slash commands (`.cursor/commands/`)
2. Hook `additional_context` (`.cursor/hooks/`)
3. Superpowers process skills
4. Project skills

## Slash Commands

| Command | Skill |
|---|---|
| `/brainstorming` | Superpowers `brainstorming` |
| `/writing-plans` | Superpowers `writing-plans` |
| `/execute-plan` | Superpowers `subagent-driven-development` |
| `/debug` | Superpowers `systematic-debugging` |
| `/verify` | Superpowers `verification-before-completion` |
| `/context7` | `.cursor/skills/context7/SKILL.md` |
| `/prompt-log` | `.cursor/skills/prompt-log/SKILL.md` |
| `/document-review` | `.cursor/skills/document-review/SKILL.md` |
| `/commit` | `.cursor/skills/commit/SKILL.md` |
| `/commit-push-pr` | `.cursor/skills/commit/SKILL.md` |

## Keyword Routing (hooks + rules)

| Trigger | Skill |
|---|---|
| 기획, UX, 새 기능, 설계 | `brainstorming` |
| 구현 계획, plan 작성, `docs/superpowers/plans` | `writing-plans` |
| plan 실행, Task N | `subagent-driven-development` |
| 버그, 테스트 실패 | `systematic-debugging` |
| 완료, 검증, 테스트 통과 | `verification-before-completion` |
| 기능 구현, TDD | `test-driven-development` |
| Context7, API 확인 | `context7` |
| Markdown 수정 후 | `document-review` |
| 작업 완료 기록 | `prompt-log` |
| 커밋 요청 | `commit` |

## After Action

| After | Then |
|---|---|
| Markdown edit | `document-review` |
| Meaningful work done | `prompt-log` |
| User asks commit | `commit` |
