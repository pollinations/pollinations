# Pollinations AI 2 - Project Enrichment Scripts

This directory contains scripts to enrich projects from Pollinations AI 1 with advanced filtering metadata.

## Overview

The enrichment system fetches projects from AI 1's JavaScript category files, identifies new projects, and enriches them with metadata using Pollinations LLM for advanced filtering in AI 2.

## Workflow

```
Pollinations AI 1
  (category JS files)
         ↓
  enrich-projects.mjs
  (fetches & compares)
         ↓
  Identifies NEW projects
         ↓
  LLM enrichment
  (adds filter metadata)
         ↓
  JSONL output files
  (data/projects/categories/)
```

## Files

-   **`enrich-projects.mjs`** - Main incremental enrichment script
-   **`tagging_prompt.txt`** - System prompt for LLM tagging
-   **`README.md`** - This file

## Usage

### 1. Dry Run (Check What's New)

```bash
cd hello.pollinations.ai/scripts
node enrich-projects.mjs --dry-run
```

This will:

-   Fetch all projects from AI 1
-   Load existing enriched projects
-   Show how many new projects need processing
-   Display sample of new projects
-   **No LLM calls are made**

### 2. Process New Projects

```bash
node enrich-projects.mjs
```

This will:

-   Fetch all projects from AI 1
-   Load existing enriched projects
-   Identify new projects (by ID)
-   Process **only new projects** with LLM
-   Preserve existing enriched projects
-   Write all projects to JSONL files

**Important:** Only new projects get LLM calls! Existing projects keep their enriched metadata.

### 3. Quiet Mode

```bash
node enrich-projects.mjs --quiet
```

Minimal output - only shows summary and errors.

## Output Structure

```
hello.pollinations.ai/
└── data/
    └── projects/
        └── categories/
            ├── hacktoberfest.jsonl
            ├── vibe-coding.jsonl
            ├── creative.jsonl
            ├── games.jsonl
            ├── hack-and-build.jsonl
            ├── chat.jsonl
            ├── social-bots.jsonl
            └── learn.jsonl
```

Each line in a JSONL file is a complete project object with:

```json
{
    "id": "pln_abc123",
    "name": "Project Name",
    "url": "https://...",
    "primary_category": "Creative",
    "modality": ["Image Generation"],
    "platform": ["Web App"],
    "audience": ["Creators"],
    "status": "Hosted App",
    "language": ["🇺🇸 EN"],
    "pollinations_integration": ["Image API"],
    "description": "🎨 Brief description...",
    "repo": "https://github.com/...",
    "stars": 42,
    "submissionDate": "2025-01-15",
    "author": "username",
    "authorUrl": "https://github.com/username",
    "order": 1,
    "hidden": false
}
```

## Filter Metadata

The LLM enriches projects with:

### Primary Category

Single value: `Hacktoberfest`, `Vibe Coding`, `Creative`, `Games`, `Hack-&-Build`, `Chat`, `Social Bots`, `Learn`

### Modality (multi-select)

`Image Generation`, `Text / Chat`, `Audio (TTS/STT)`, `Video`, `Image Analysis`, `Multimodal`

### Platform (multi-select)

`Web App`, `Android`, `iOS`, `Desktop`, `Browser Extension`, `Discord`, `Telegram`, `API/SDK`, `Games Platform`, `Messaging Platform`, `Roblox`

### Audience (multi-select)

`Developers`, `Creators`, `Gamers`, `Education`, `General`, `Specialized`

### Status (single)

`Hosted App`, `Repo Only`, `Both`, `Tutorial/Content`

### Language (multi-select)

`🇺🇸 EN`, `🇨🇳 ZH`, `🇪🇸 ES`, `🇮🇩 ID`, `🇷🇺 RU`, `🇵🇹 PT`, `🇧🇷 BR`, `🌐 Other/Unknown`

### Pollinations Integration (multi-select)

`Image API`, `Text API`, `Audio API`, `API/SDK`, `MCP Server`, `Unknown`

## When to Run

Run this script when:

1. **AI 1 projects are updated** - New projects added to category files
2. **Periodic sync** - Weekly/monthly to catch any missed projects
3. **After manual edits** - If you manually update AI 1 project files

## Performance

-   **First run**: May process 200+ projects (takes ~3-5 minutes)
-   **Incremental runs**: Only processes new projects (seconds to minutes)
-   **Rate limiting**: 1 second delay between LLM calls
-   **Retries**: 3 attempts per project with exponential backoff

## Error Handling

If a project fails after 3 attempts:

-   Error is logged but script continues
-   Other projects are still processed
-   Failed projects listed in summary
-   Can be re-run later to retry failures

## Example Workflow

```bash
# 1. Check what's new
node enrich-projects.mjs --dry-run

# Output:
# Found 200 upstream projects
# 187 existing, 13 new
# Sample new: [...]

# 2. Process new projects
node enrich-projects.mjs

# Output:
# Processing 13 new projects with LLM...
# [1/13] Processing: Project Name (Creative)
#   ✅ Enriched successfully
# ...
# ✅ Enrichment complete!
# 13 newly enriched, 187 existing, 200 total

# 3. Files are ready
ls -lh ../data/projects/categories/
```

## Troubleshooting

**Problem:** Script hangs on LLM calls

-   **Solution:** Check text.pollinations.ai is accessible
-   Try: `curl https://text.pollinations.ai/test`

**Problem:** "No exported array found" error

-   **Solution:** AI 1 file format changed
-   Check the UPSTREAM_SOURCES URLs are correct

**Problem:** All projects marked as "new"

-   **Solution:** JSONL files missing or corrupted
-   Check `data/projects/categories/` directory exists

**Problem:** LLM returns invalid JSON

-   **Solution:** Retry logic will attempt 3 times
-   If persistent, check tagging_prompt.txt clarity

## Next Steps

After running the enrichment:

1. Load JSONL files in AI 2 frontend
2. Build filtering UI components
3. Implement URL-based filter state
4. Create project card components with rich metadata
