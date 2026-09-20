# Memory Constellations

This code agent finds a grounded connection between two entries in the public Pollinations collective memory and adds one append-only note under `lore/constellations/`.

The language model never receives a shell tool. Agent code runs a small set of fixed Git commands, validates every selected path against a safe manifest, writes generated Markdown only through `stdin`, and verifies that the staged change is exactly one new file before committing. Repository content is passed to the model as untrusted evidence and is never interpolated into a command.

## Safety boundaries

- The clone is fixed to `pollinations/collective-memory` and one workspace directory.
- Only safe tracked Markdown paths can be selected, from two different top-level folders.
- Model-controlled paths, slugs, URLs, emails, code fences, and control characters are rejected.
- The only write is a uniquely named file below `lore/constellations/`.
- Edits, deletions, dirty worktrees, unexpected staged files, and force pushes are rejected.

## Test

```bash
node --test agent.test.ts
```
