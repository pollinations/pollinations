# Agent Guidelines for pollinations.ai

## App Submission Handling

App submissions are now **fully automated** via the `app-review-submission.yml` workflow.

**Source of truth:** `apps/APPS.md` - A single markdown table with all apps.

**How it works:**

1. User opens issue with `tier:review` label
2. Workflow parses issue with AI, checks Enter registration
3. If valid: fetches GitHub stars, AI generates emoji + description
4. Prepends new row to `apps/APPS.md`, updates README with last 10 apps
5. Creates PR automatically

**Manual edits (if needed):**

- Edit `apps/APPS.md` directly
- Run `node .github/scripts/app-update-readme.js` to refresh README

**Table format in APPS.md:**

```markdown
| Emoji | Name     | Web_URL | Description                   | Language | Category | GitHub  | GitHub_ID | Repo                   | Stars | Discord | Other | Submitted  |
| ----- | -------- | ------- | ----------------------------- | -------- | -------- | ------- | --------- | ---------------------- | ----- | ------- | ----- | ---------- |
| 🎨    | App Name | url     | Brief description (~80 chars) |          | creative | @github | 12345678  | https://github.com/... | ⭐123 |         |       | 2025-01-01 |
```

**Categories:**

- Vibes ✨ (`Vibes`): No-code / describe-to-code playgrounds and builders
- Creative 🎨 (`Creative`): Turn prompts into images, video, music, design, slides
- Games 🎲 (`Games`): AI-powered play, interactive fiction, puzzle & agent worlds
- Dev_Tools 🛠️ (`Dev_Tools`): SDKs, integration libs, extensions, dashboards, MCP servers
- Chat 💬 (`Chat`): Standalone chat UIs / multi-model playgrounds
- Social_Bots 🤖 (`Social_Bots`): Discord / Telegram / WhatsApp / Roblox bots & NPCs
- Learn 📚 (`Learn`): Tutorials, guides, style books & educational demos

## Non-English Apps

- Use ISO language code in the `Language` column (e.g., `zh-CN`, `es`, `pt-BR`, `ja`)
- No flags in the table - use language codes only

## Discord Configuration

**pollinations.ai Discord Server:**

- **Guild ID**: `885844321461485618`
- **Server**: https://discord.gg/pollinations-ai-885844321461485618

Use this guild ID when interacting with Discord MCP tools for announcements, community management, etc.

## Repository Structure

Key directories and their purposes:

```
pollinations/
├── image.pollinations.ai/     # Image generation backend service
├── text.pollinations.ai/      # Text generation backend service
├── pollinations.ai/           # Main React frontend application
├── packages/                  # Publishable npm packages
│   ├── sdk/                   # @pollinations/sdk - Client library with React hooks
│   └── mcp/                   # @pollinations/model-context-protocol - MCP server
├── enter.pollinations.ai/     # Centralized auth gateway (ACTIVE)
└── operations/                # Documentation and operations
```

## API Gateway

**Primary endpoint:** `https://gen.pollinations.ai`

All API requests go through `gen.pollinations.ai`, which routes to the `enter.pollinations.ai` gateway for authentication and billing.

- **Authentication**: Publishable keys (`pk_`) for frontend, Secret keys (`sk_`) for backend
- **Billing**: Pollen credits ($1 ≈ 1 Pollen)
- **Get API keys**: [enter.pollinations.ai](https://enter.pollinations.ai)
- **Full API docs**: [APIDOCS.md](./APIDOCS.md)

### Local Development

**Service Ports:**
- **enter.pollinations.ai**: `http://localhost:3000` (API under `/api/*`)
- **text.pollinations.ai**: `http://localhost:16385`
- **image.pollinations.ai**: `http://localhost:16384`

**Local API Testing:**
```bash
# Enter gateway (local)
curl "http://localhost:3000/api/generate/image/test?model=flux" -H "Authorization: Bearer $TOKEN"
curl "http://localhost:3000/api/generate/v1/chat/completions" -H "Authorization: Bearer $TOKEN" ...
```

**Testing Enter with Local Services:**
To test enter.pollinations.ai with local text/image services, edit `enter.pollinations.ai/wrangler.toml`:
```toml
# Default (remote EC2):
IMAGE_SERVICE_URL = "http://ec2-3-80-56-235.compute-1.amazonaws.com:16384"
TEXT_SERVICE_URL = "http://ec2-3-80-56-235.compute-1.amazonaws.com:16385"

# For local testing (env.local):
IMAGE_SERVICE_URL = "http://localhost:16384"
TEXT_SERVICE_URL = "http://localhost:16385"
```
Use `npm run dev` in each service directory to start them.

## Model Context Protocol (MCP)

The `packages/mcp/` directory contains a Model Context Protocol server that allows AI agents to directly generate images, text, and audio using the pollinations.ai API.

For detailed implementation notes, design principles, and troubleshooting, see:

- `packages/mcp/README.md` - Installation and usage
- `packages/mcp/AGENTS.md` - Implementation guidelines and debugging

## API Quick Reference

### Image Generation

```bash
curl 'https://gen.pollinations.ai/image/{prompt}' -H 'Authorization: Bearer YOUR_API_KEY'
```

### Text Generation (OpenAI-compatible)

```bash
curl 'https://gen.pollinations.ai/v1/chat/completions' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"model": "openai", "messages": [{"role": "user", "content": "Hello"}]}'
```

### Simple Text

```bash
curl 'https://gen.pollinations.ai/text/{prompt}?key=YOUR_API_KEY'
```

### Model Discovery

- **Image models**: `https://gen.pollinations.ai/image/models`
- **Text models**: `https://gen.pollinations.ai/v1/models`

### Documentation

- **[Full API Documentation](./APIDOCS.md)**
- **[Enter Services Deployment](.claude/skills/enter-services/SKILL.md)** - Deploy and manage services on AWS EC2

## ⚠️ YAGNI - You Aren't Gonna Need It

**THIS IS CRITICAL. Follow YAGNI religiously:**

- **Don't keep code for "potential futures"** - Only implement what's needed NOW
- **Remove unused functions** - Even if they "might be useful someday"
- **No speculative abstractions** - If we need it later, we'll add it then
- **No "just in case" helpers** - Don't create test utilities or wrappers preemptively
- **Keep the codebase minimal** - Less code = fewer bugs = easier maintenance

## Code Style

**Prefer functional, elegant, and minimal solutions:**

- Don't implement things we're not using anymore
- Check assumptions on the web and codebase regularly
- When continuing work from a previous session, read all relevant code first
- Check related PRs including comments, description, and history
- If in the middle of a feature/fix, identify clear next steps before proceeding

## Common Mistakes to Avoid

**IMPORTANT - Claude often makes these mistakes:**

- **Don't use `cd` in bash commands** - Use the `cwd` parameter instead
- **Don't run `pytest`** - Use `npm run test` or `npx vitest run`
- **Don't create .md documentation files** unless explicitly asked
- **Always use absolute paths** for file operations
- **Don't edit files manually during a Claude Code session** - this busts the cache
- **Don't run `/compact`** unless absolutely necessary - it busts cache
- **Don't let searches run wild** - Use targeted file paths, not broad searches
- **Don't modify test files to make tests pass** - Fix the actual code instead
- **Run `npm run decrypt-vars`** before running tests in enter.pollinations.ai
- **Check `.testingtokens`** file for test API keys: `enter.pollinations.ai/.testingtokens`

## Development Guidelines

1. Code Style:

   - Use modern JavaScript/TypeScript features
   - Use ES modules (import/export) - all .js files are treated as ES modules
   - Follow existing code formatting patterns
   - Add descriptive comments for complex logic
   - **Run biome check** after making changes: `npx biome check --write <file>`

2. Testing:

   - Add tests for new features in appropriate test directories
   - Follow existing test patterns in /test directories
   - **Test with real production code, not mocks** - Tests should validate actual behavior
   - Avoid creating mock infrastructure - use direct function imports instead

   **Test Commands by Service:**
   - **enter.pollinations.ai**: `cd enter.pollinations.ai && npm run test` (vitest + Cloudflare Workers pool)
   - **image.pollinations.ai**: `cd image.pollinations.ai && npm run test` (vitest)
   - **text.pollinations.ai**: No test runner configured yet

   **⚡ Run tests individually** - Full suite takes time. Use:
   ```bash
   npx vitest run --testNamePattern="specific test name"
   npx vitest run test/specific-file.test.ts
   ```

   **Snapshot System:** enter.pollinations.ai uses VCR-style snapshots for API responses:
   - Snapshots stored in test fixtures, replayed during tests
   - Set `TEST_VCR_MODE=record` to record new snapshots
   - Default mode is `replay-or-record`

   **Testing Tokens:** `enter.pollinations.ai/.testingtokens` contains:
   - `ENTER_API_TOKEN_LOCAL` / `ENTER_API_TOKEN_REMOTE` - API keys
   - `ENTER_TOKEN`, `GITHUB_TOKEN`, `POLAR_ACCESS_TOKEN`

   **Testing Best Practices:**
   - Read existing tests entirely to understand patterns before adding new ones
   - Prefer adding to existing test files over creating new ones
   - Test core functionality - minimal, short, and sweet
   - Don't create new testing patterns - follow existing conventions
   - Make requests to `gen.pollinations.ai` for production API testing

3. Documentation:

   - Update API docs for new endpoints
   - Add JSDoc comments for new functions
   - Update README.md for user-facing changes
   - **Avoid creating markdown documentation files while working** unless explicitly requested
   - If temporary files are needed for testing/debugging, create them in a `temp/` folder clearly labeled as temporary

4. Architecture Considerations:

   - Frontend changes should be in pollinations.ai/
   - Image generation in image.pollinations.ai/
   - Text generation in text.pollinations.ai/
   - SDK and React components in packages/sdk/
   - AI assistant integrations in packages/mcp/

6. Security:
   - Never expose API keys or secrets
   - Use environment variables for sensitive data
   - Implement proper input validation

## Common Tasks

1. Adding New Models:

   - Update models list in respective service
   - Add model configuration
   - Update API documentation

2. Frontend Updates:

   - Follow React best practices
   - Use existing UI components
   - Maintain responsive design

3. API Changes:

   - Maintain backward compatibility
   - Update documentation
   - Add appropriate error handling

4. API Documentation Guidelines:
   - Keep documentation strictly technical and user-focused
   - Avoid marketing language or promotional content
   - Link to dynamic endpoints (like /models) rather than hardcoding lists that may change
   - Don't include internal implementation details or environment variables
   - Focus on endpoints, parameters, and response formats
   - For new features, document both simplified endpoints and OpenAI-compatible endpoints
   - Include minimal, clear code examples that demonstrate basic usage

# Git Workflow

- If the user asks to send to git or something similar do all these steps:
- Git status, diff, create branch, commit all, push and write a PR description

## Communication Style

**BE CONCISE. All PRs, comments, issues: bullet points, <200 words, NO FLUFF.**

**PR Format:**
- Use "- Adds X", "- Fix Y" format
- 3-5 bullets max
- Simple titles: "fix:", "feat:", "Add"
- No long paragraphs, no marketing language

**Issue Comments:**
- Bullet points only
- State facts, not opinions
- Link to relevant code/files
- No "I think" or "maybe" - be direct

## GitHub Labels

- Only use established labels (check with `mcp1_list_issues`)
- Avoid creating new labels unless part of broader strategy
- Keep names consistent with existing patterns

## Contributor Attribution

**Commit format:**

```
feat: add feature

Co-authored-by: username <user_id+username@users.noreply.github.com>
Fixes #issue
```

- Use "Fixes #issue" or "Addresses #issue" in PR descriptions
- Email format: `{username} <{user_id}+{username}@users.noreply.github.com>`
- Find user_id in issue API response
