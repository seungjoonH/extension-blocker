#!/usr/bin/env python3
"""Inject project skill routing manifest at session start."""

import json

MANIFEST = (
    "HOOK [session-start]: Mandatory skill routing active. "
    "Read `.cursor/skills/using-project-skills/SKILL.md` first. "
    "Slash commands: /brainstorming, /writing-plans, /execute-plan, /debug, /verify, "
    "/context7, /prompt-log, /document-review, /commit, /commit-push-pr. "
    "Each requires reading the matching skill before action."
)

print(json.dumps({"additional_context": MANIFEST}))
