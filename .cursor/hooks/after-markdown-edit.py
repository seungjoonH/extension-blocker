#!/usr/bin/env python3
"""Inject document-review routing after Markdown file edits."""

import json
import sys

EXCLUDED = "docs/과제_파일업로드_AI개발.md"


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)

    path = ""
    for key in ("tool_input", "arguments", "input"):
        block = payload.get(key)
        if isinstance(block, dict):
            path = block.get("path") or block.get("target_notebook") or ""
            if path:
                break

    if not path.endswith(".md"):
        sys.exit(0)
    if EXCLUDED in path.replace("\\", "/"):
        sys.exit(0)

    print(
        json.dumps(
            {
                "additional_context": (
                    "HOOK [document-review]: A Markdown file was edited. "
                    "Before completing this turn, Read "
                    "`.cursor/skills/document-review/SKILL.md` and execute "
                    "document-review per the skill."
                )
            }
        )
    )


if __name__ == "__main__":
    main()
