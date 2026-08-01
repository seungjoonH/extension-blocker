#!/usr/bin/env python3
"""Route user prompts to project and Superpowers skills."""

import json
import re
import sys

# First match wins. Process skills before implementation skills.
ROUTES = [
    (
        re.compile(
            r"prompt-log|PROMPT_LOG|프롬프트\s*로그",
            re.I,
        ),
        (
            "HOOK [prompt-log]: Read `.cursor/skills/prompt-log/SKILL.md` "
            "and follow it exactly before any other action."
        ),
    ),
    (
        re.compile(r"/document-review\b|document-review|문서\s*검토|markdown\s*검토", re.I),
        (
            "HOOK [document-review]: Read `.cursor/skills/document-review/SKILL.md` "
            "and follow it exactly before any other action."
        ),
    ),
    (
        re.compile(r"(?:/commit\b|/commit-push-pr\b|커밋해|commit-push-pr|PR\s*만들)", re.I),
        (
            "HOOK [commit]: Read `.cursor/skills/commit/SKILL.md` "
            "and follow it exactly before any other action."
        ),
    ),
    (
        re.compile(
            r"/brainstorming\b|brainstorming|기획|브레인\s*스토밍|"
            r"요구\s*사항\s*정리|화면\s*구성|사용자\s*흐름|UX\s*설계|"
            r"새\s*기능|설계\s*해|정책\s*논의",
            re.I,
        ),
        (
            "HOOK [brainstorming]: Read the Superpowers `brainstorming` skill "
            "and follow it exactly before any other action."
        ),
    ),
    (
        re.compile(
            r"/writing-plans\b|writing-plans|구현\s*계획|계획\s*세|plan\s*작성|"
            r"태스크\s*분해|docs/superpowers/plans",
            re.I,
        ),
        (
            "HOOK [writing-plans]: Read the Superpowers `writing-plans` skill "
            "and follow it exactly before any other action."
        ),
    ),
    (
        re.compile(
            r"/execute-plan\b|subagent-driven-development|executing-plans|"
            r"plan\s*실행|Task\s*\d+|태스크\s*실행",
            re.I,
        ),
        (
            "HOOK [execute-plan]: Read the Superpowers `subagent-driven-development` "
            "skill and follow it exactly before any other action."
        ),
    ),
    (
        re.compile(
            r"/debug\b|systematic-debugging|버그|디버그|debug|"
            r"테스트\s*실패|unexpected|에러|오류|안\s*돼",
            re.I,
        ),
        (
            "HOOK [debug]: Read the Superpowers `systematic-debugging` skill "
            "and follow it exactly before any other action."
        ),
    ),
    (
        re.compile(
            r"/verify\b|verification-before-completion|완료\s*선언|"
            r"검증\s*해|verify|끝났|다\s*했|테스트\s*통과",
            re.I,
        ),
        (
            "HOOK [verify]: Read the Superpowers `verification-before-completion` skill "
            "and follow it exactly before any other action."
        ),
    ),
    (
        re.compile(
            r"/context7\b|Context7|공식\s*문서|API\s*확인|라이브러리\s*버전|"
            r"MCP\s*문서",
            re.I,
        ),
        (
            "HOOK [context7]: Read `.cursor/skills/context7/SKILL.md` "
            "and follow it exactly before any other action."
        ),
    ),
    (
        re.compile(
            r"test-driven-development|\bTDD\b|기능\s*구현|bugfix\s*구현",
            re.I,
        ),
        (
            "HOOK [tdd]: Read the Superpowers `test-driven-development` skill "
            "and follow it exactly before any other action."
        ),
    ),
]


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)

    prompt = payload.get("prompt") or payload.get("user_message") or ""
    if not isinstance(prompt, str):
        sys.exit(0)

    for pattern, message in ROUTES:
        if pattern.search(prompt):
            if message is None:
                continue
            print(json.dumps({"additional_context": message}))
            break


if __name__ == "__main__":
    main()
