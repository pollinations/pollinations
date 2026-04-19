# @pollinations_ai/skills

Shared, agent-agnostic skills for Pollinations. Each subdirectory is a self-contained skill: a `SKILL.md` describing when and how to use it, plus any supporting scripts.

## Why this folder exists

Skills under `.claude/skills/` are only discoverable by Claude Code. The skills here follow the same `SKILL.md` format but have no dependency on any specific agent harness — they wrap public Pollinations APIs or generic dev tooling, so any agent that understands SKILL.md can consume them.

Pollinations-internal or Claude-Code-harness-specific skills (tier management, Tinybird deploys, permission-prompt tuning, etc.) stay under `.claude/skills/`. The agent-agnostic ones live here and are symlinked back into `.claude/skills/` so Claude Code keeps finding them.

## Layout

```
packages/skills/
  <skill-name>/
    SKILL.md          # frontmatter + prose
    scripts/ …        # optional supporting scripts
    example/ …        # optional examples
```

`SKILL.md` frontmatter:

```yaml
---
name: <skill-name>
description: <one sentence: what it does and when to use it>
allowed-tools: <optional, agent-specific>
---
```

## Consuming from another agent

- **Claude Code** — already works via the symlinks in `.claude/skills/`.
- **Other harnesses** — point your skill-loader at `packages/skills/` (or a specific subdirectory). The SKILL.md format is the contract; no runtime coupling.

## Adding a new skill

1. Create `packages/skills/<your-skill>/SKILL.md` with the frontmatter above.
2. If Claude Code should also pick it up, add a symlink: `ln -s ../../packages/skills/<your-skill> .claude/skills/<your-skill>`.
3. Keep the skill agent-agnostic: wrap public CLIs/APIs, avoid harness-specific features (hooks, settings.json, keybindings). If it needs those, it belongs in `.claude/skills/` instead.
