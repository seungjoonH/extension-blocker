# commit-push-pr

**REQUIRED:** Read and follow `.cursor/skills/commit/SKILL.md` (PR section) exactly before doing anything else.

## Context

Gather git context first:

- `git status`
- `git diff` (staged and unstaged)
- remote tracking status
- `git log --oneline -10`
- `git diff [base-branch]...HEAD` for full branch changes

## Your task

1. Create a feature branch if currently on main
2. Stage and commit with an appropriate Conventional Commits message (Korean body)
3. Push with `git push -u origin HEAD`
4. Create a PR with `gh pr create` including Summary and Test plan

Do not force-push unless the user explicitly asks.
