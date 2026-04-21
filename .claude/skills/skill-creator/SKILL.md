---
name: skill-creator
description: Scaffold a new agent-agnostic skill under packages/skills/ with consistent SKILL.md frontmatter and a symlink back into .claude/skills/. Use when asked to create, add, or bootstrap a new skill for the Pollinations repo.
allowed-tools: Bash(ln *), Bash(ls *), Bash(mkdir *), Read, Write
---

# skill-creator

Bootstrap a new skill under [packages/skills/](../) following the shared format described in [packages/skills/README.md](../README.md).

## When to use

- User asks to "add a skill", "create a skill", "bootstrap a new capability for agents"
- You are about to write a new `SKILL.md` and want the frontmatter + layout right on the first try
- You want to keep skills discoverable by Claude Code *and* any other agent harness

## Two homes, one source of truth

- **`packages/skills/<name>/`** — the real directory. Agent-agnostic skills live here.
- **`.claude/skills/<name>`** — a relative symlink back to the shared directory. Claude Code discovers skills by scanning this folder.
- **Pollinations-internal / Claude-harness-specific** skills (credentials, hooks, settings.json) stay in `.claude/skills/` as real directories.

Decision rule: if the skill wraps public APIs/CLIs or generic dev tooling → `packages/skills/`. If it needs internal infra, secrets, or Claude-Code-only features → `.claude/skills/`.

## Anatomy of a good skill

```
packages/skills/<name>/
  SKILL.md           # required
  scripts/           # optional — bash/python helpers invoked from the prose
  example/           # optional — runnable example inputs/outputs
```

`SKILL.md` frontmatter:

```yaml
---
name: <kebab-case-name>              # must match the directory name
description: <one sentence: what it does AND when to use it — the agent decides whether to load the body from this alone, so write it like a trigger>
allowed-tools: <optional, Claude-Code-specific, e.g. "Bash(polli *), Read, Write">
---
```

Body checklist:

1. **When to use** — concrete user-intent signals ("user asks to X", "repo contains Y"). The agent matches against these.
2. **Quick reference** — a table of intent → command. Optimized for scanning.
3. **Commands / recipes** — copy-pasteable invocations. Prefer wrapping an existing CLI over inventing one.
4. **Gotchas** — the tribal knowledge that isn't obvious from the code (rate limits, flag footguns, auth quirks).
5. **No filler** — no marketing, no "in conclusion". Agents pay for every token of context.

## Create a new skill (recipe)

```bash
NAME="my-skill"  # kebab-case

# 1. Make the real directory under packages/skills/
mkdir -p "packages/skills/$NAME"

# 2. Seed SKILL.md (fill in description + body)
cat > "packages/skills/$NAME/SKILL.md" <<'EOF'
---
name: my-skill
description: <one sentence: what it does AND when to use it>
---

# my-skill

## When to use
- ...

## Quick reference
| Intent | Command |
|---|---|
| ... | ... |

## Gotchas
- ...
EOF

# 3. Symlink back so Claude Code discovers it
ln -s "../../packages/skills/$NAME" ".claude/skills/$NAME"

# 4. Verify
ls -la ".claude/skills/$NAME"   # should show a symlink
readlink ".claude/skills/$NAME" # should print ../../packages/skills/<name>
```

## Writing the description (the single most important line)

The `description` is the only thing loaded into the agent's context by default. It's a trigger, not a title.

Good: *"Generate images, text, audio, video, and transcribe speech via the Pollinations API using the polli CLI. Use when asked to generate media, call pollinations.ai, check pollen balance, list models, manage API keys, or run polli commands."*

Bad: *"Polli helper."*

Rules:
- First clause: what the skill does (verb-led).
- Second clause: *when* to load it — user-intent phrases the agent should match on.
- Include the concrete tool/CLI name (`polli`, `ffmpeg`, `gh`) — helps intent-matching.
- One or two sentences max. If you need more, put it in the body.

## Gotchas

- **Name must match directory name.** `name:` in frontmatter = folder name, or Claude Code silently skips the skill.
- **Relative symlink, not absolute.** Use `../../packages/skills/<name>` so it works regardless of where the repo is cloned.
- **Don't duplicate existing skills.** `ls packages/skills/ .claude/skills/` first; extend before inventing.
- **No harness coupling in `packages/skills/`.** If your skill needs `settings.json` hooks, it belongs in `.claude/skills/` instead.
- **Update [AGENTS.md](../../../AGENTS.md)** only if the skill changes a repo-wide convention; individual skills are discovered automatically.

## Verification

After creating a skill:

```bash
ls -la .claude/skills/<name>                 # symlink resolves
cat packages/skills/<name>/SKILL.md | head -5 # frontmatter present
```

In Claude Code, the skill should appear in the available-skills list after a reload with the same `name` and `description` you set.
