---
name: skill-creator
description: Scaffold a new skill for the Pollinations repo with correct SKILL.md frontmatter, placed in the right folder (.claude/skills or packages/skills). Use when asked to create, add, or bootstrap a new skill. Enforces the curation rule — this is not a general Claude-skills dump.
allowed-tools: Bash(ln *), Bash(ls *), Bash(mkdir *), Read, Write
---

# skill-creator

Bootstrap a new skill in the right place. The Pollinations repo has two skill homes, and the decision of where a new skill goes is the most important thing this skill enforces.

## When to use

- User asks to "add a skill", "create a skill", "bootstrap a new capability for agents"
- You are about to write a new `SKILL.md` and want the frontmatter + placement right on the first try

## The placement rule (do this first, every time)

Ask: **would an agent working outside the Pollinations team benefit from this skill?**

- **Yes** → `packages/skills/<name>/` as a real directory, plus a relative symlink at `.claude/skills/<name>`. Agent-agnostic *and* externally useful (e.g. wrappers around our public API, generic dev helpers).
- **No** → `.claude/skills/<name>/` as a real directory. Internal. This covers both:
  - Claude-Code-harness-specific skills (hooks, `settings.json` tuning, permission prompts, keybindings)
  - Pollinations-team-internal workflows (our issue conventions, tier management, Tinybird deploys, app review, probes against our own infra)

This is **not** a general Claude-skills repo. If a skill doesn't help Pollinations, it doesn't belong in either folder.

Moving a skill from `packages/skills/` back to `.claude/skills/` later is **not** a regression — it is curation. See [packages/skills/README.md](../../../packages/skills/README.md).

## Anatomy of a good skill

```
<home>/<name>/
  SKILL.md           # required
  scripts/           # optional — bash/python helpers invoked from the prose
  example/           # optional — runnable example inputs/outputs
```

`SKILL.md` frontmatter (open format, also understood by Cursor, Cline, Codex, Gemini):

```yaml
---
name: <kebab-case-name>              # must match the directory name
description: <one sentence: what it does AND when to use it — the agent decides whether to load the body from this alone, so write it like a trigger>
allowed-tools: <optional, Claude-Code-specific, e.g. "Bash(polli *), Read, Write">
---
```

Body checklist:

1. **When to use** — concrete user-intent signals ("user asks to X", "repo contains Y").
2. **Quick reference** — a table of intent → command.
3. **Commands / recipes** — copy-pasteable invocations. Prefer wrapping existing CLIs.
4. **Gotchas** — tribal knowledge that isn't obvious from the code.
5. **No filler** — no marketing. Agents pay for every token.

## Recipe A — externally-useful skill (goes in `packages/skills/`)

```bash
NAME="my-skill"

mkdir -p "packages/skills/$NAME"

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

ln -s "../../packages/skills/$NAME" ".claude/skills/$NAME"
ls -la ".claude/skills/$NAME"   # should show a symlink
```

## Recipe B — internal-only skill (goes in `.claude/skills/`)

```bash
NAME="my-internal-skill"

mkdir -p ".claude/skills/$NAME"

cat > ".claude/skills/$NAME/SKILL.md" <<'EOF'
---
name: my-internal-skill
description: <one sentence: what it does AND when to use it>
---

# my-internal-skill

## When to use
- ...
EOF
```

No symlink. Claude Code discovers it directly.

## Writing the description (the single most important line)

The `description` is the only thing loaded into the agent's context by default. It is a trigger, not a title.

Good: *"Generate images, text, audio, video, and transcribe speech via the Pollinations API using the polli CLI. Use when asked to generate media, call pollinations.ai, check pollen balance, list models, manage API keys, or run polli commands."*

Bad: *"Polli helper."*

Rules:
- First clause: what the skill does (verb-led).
- Second clause: *when* to load it — user-intent phrases the agent should match on.
- Include the concrete tool/CLI name (`polli`, `ffmpeg`, `gh`).
- One or two sentences max.

## Gotchas

- **Name must match directory name**, or the agent silently skips the skill.
- **Relative symlinks, not absolute** when using Recipe A. `../../packages/skills/<name>`.
- **Don't duplicate existing skills.** `ls .claude/skills/ packages/skills/` first; extend before inventing.
- **If unsure which home, default to `.claude/skills/`.** Promoting a skill later is easy; retracting a public one is messier.
- **Never commit secrets**, even in `.claude/skills/`. Reference env vars by name.

## Verification

```bash
ls -la <home>/skills/<name>                   # directory or symlink exists
head -5 <home>/skills/<name>/SKILL.md         # frontmatter present
```

In Claude Code, the skill should appear in the available-skills list after a reload with the same `name` and `description` you set.
