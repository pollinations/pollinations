# @pollinations_ai/skills

Curated, agent-agnostic skills for working with Pollinations from *outside* the Pollinations team. Each subdirectory is a self-contained skill: a `SKILL.md` in the open format, plus any supporting scripts.

## What belongs here

A skill lives in `packages/skills/` only if **both** are true:

1. It helps agents working with the Pollinations public ecosystem (our API, our CLIs, our docs).
2. It is valuable to an agent **outside the Pollinations team** — working on its own project or helping its own user.

This is not a general Claude skills dump, and it is not a mirror of everything in `.claude/skills/`. The bar is deliberately high so that a non-Claude agent pointed at this folder gets a tight, high-signal set.

Everything else that helps Pollinations — Claude-Code-harness-specific skills (hooks, settings.json, permission tuning) *and* Pollinations-team-internal workflows (issue conventions, tier management, Tinybird deploys, app-review pipelines, API probes against our own infra) — lives under `.claude/skills/`, which is where the team runs day-to-day.

Skills can move between the two folders as the criterion becomes clearer. Moving a skill from `packages/skills/` → `.claude/skills/` is not a regression — it is curation.

## Layout

```
packages/skills/
  <skill-name>/
    SKILL.md          # required — frontmatter + prose
    scripts/ …        # optional supporting scripts
    example/ …        # optional examples
```

`SKILL.md` frontmatter (open format, also consumed by Claude Code, Cursor, Cline, Codex, Gemini, etc.):

```yaml
---
name: <skill-name>                  # must match directory name
description: <one sentence: what it does AND when to use it — this is the trigger>
allowed-tools: <optional, agent-specific>
---
```

## Consuming from another agent

- **Claude Code** — the team's primary harness; discovers these via symlinks at `.claude/skills/<name>` pointing back into this folder.
- **Other harnesses** (Cursor, Cline, Codex, custom) — point your skill-loader at `packages/skills/` directly, or pick individual subdirectories. The SKILL.md format is the contract; no runtime coupling to any harness.

## Adding a new skill

Before adding anything, apply the criterion above. If the skill is really about *our* team's internal workflow (even if mechanically written as a bash script), it belongs in `.claude/skills/`.

If it passes:

1. Create `packages/skills/<your-skill>/SKILL.md` with the frontmatter above.
2. Symlink back for Claude Code: `ln -s ../../packages/skills/<your-skill> .claude/skills/<your-skill>`.
3. Verify: `ls -la .claude/skills/<your-skill>` shows the symlink resolving.

The `skill-creator` skill (in `.claude/skills/`) has the full recipe.
