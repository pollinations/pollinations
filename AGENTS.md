# Agent Guidelines for Pollinations.AI

## Project Submission Handling

When handling project submission issues (labeled as **APPS** in GitHub):

1. Add new projects to the appropriate category file in:

    - pollinations.ai/src/config/projects/[category].js (e.g., creative.js, vibeCoding.js, etc.)
    - DO NOT manually edit the README.md file directly
    - After adding projects, regenerate the lists by running:
        ```bash
        node pollinator-agent/project-list-scripts/generate-project-table.js --update-readme
        ```

2. Project Entry Format:

    ```javascript
    {
      name: "Project Name",
      url: "https://project-url.com", // REQUIRED - working project URL
      description: "Brief description of the project.",
      author: "@discord_username", // if available or alternatively a URL to a social media profile
      repo: "https://github.com/repo-url", // OPTIONAL - GitHub repo if available
      submissionDate: "YYYY-MM-DD", // automatically added for new submissions
      language: "zh-CN", // for non-English projects, include the language code
      hidden: true, // optional, set to true for broken projects that shouldn't appear in README.md
      order: 1 // ordering priority based on status (1=highest, 5=lowest)
    }
    ```

3. Project Ordering Rules:

    - In the README.md file, projects should be ordered within their categories:
        - First by the `order` parameter (lower values first: 1, 2, 3, 4, 5)
        - Then by GitHub star count (higher star counts first)
        - For projects with the same order and no stars, use the submission date if there is one, if not keep the order as it is.
    - In the website rendering, the projectList.js order will be dynamically sorted using the same criteria so the actual order in the projectList.js file should not be changed

4. Hiding Broken Projects:

    - Set `hidden: true` for broken/unmaintained projects
    - Hidden projects excluded from README.md but remain in projectList.js

5. GitHub Star Counts:

    - Add `stars` property for GitHub repos
    - Update counts: `node .github/scripts/app_list_update_stars.js [owner/repo]`

6. Categories (as of June 2025):
    - Vibe Coding ✨ (`vibeCoding.js`): No-code / describe-to-code playgrounds and builders
    - Creative 🎨 (`creative.js`): Turn prompts into images, video, music, design, slides
    - Games 🎲 (`games.js`): AI-powered play, interactive fiction, puzzle & agent worlds
    - Hack-&-Build 🛠️ (`hackAndBuild.js`): SDKs, integration libs, extensions, dashboards, MCP servers
    - Chat 💬 (`chat.js`): Standalone chat UIs / multi-model playgrounds
    - Social Bots 🤖 (`socialBots.js`): Discord / Telegram / WhatsApp / Roblox bots & NPCs
    - Learn 📚 (`learn.js`): Tutorials, guides, style books & educational demos
    - (Tracking file: `tracking/toProcess.md` for workflow management)

## Classification Guidelines

-   One category per project (no duplicates)
-   Based on actual functionality, not source JSON category
-   Prefer less-populated categories for balance
-   Track uncategorized in `tracking/toProcess.md`
-   Source of truth: `accumulated-projects.json`

**Category Mapping:**

-   `learn.js`: Educational/interactive learning
-   `hackAndBuild.js`: SDKs, APIs, toolkits
-   `creative.js`: Image/text/audio generation
-   `chat.js`: Chatbots, conversational agents
-   `games.js`: Games, interactive fiction
-   `socialBots.js`: Platform bots (Discord/Telegram/etc)

7. Add UTF-8 icons to titles (🤖 bots, 🎨 creative, etc.)

8. Non-English projects:

    - Add country flag emoji (🇨🇳, 🇪🇸, etc.)
    - Include `language` field with language code
    - Add English translation in parentheses

9. Commit attribution:

    ```
    Add [Project Name] to [category]

    Co-authored-by: [Username] <[user_id]+[username]@users.noreply.github.com>
    Closes #[Issue]
    ```

## Discord Configuration

**Pollinations Discord Server:**

-   **Guild ID**: `885844321461485618`
-   **Server**: https://discord.gg/pollinations

Use this guild ID when interacting with Discord MCP tools for announcements, community management, etc.

## Repository Structure

Key directories and their purposes:

```
pollinations/
├── image.pollinations.ai/     # Image generation backend service
├── text.pollinations.ai/      # Text generation backend service
├── pollinations.ai/           # Main React frontend application
├── pollinations-react/        # React component library
├── model-context-protocol/    # MCP server for AI assistant integration
├── enter.pollinations.ai/     # Centralized auth gateway (ACTIVE)
└── operations/                # Documentation and operations
```

## API Gateway Transition (Important)

**We are currently running two API systems simultaneously:**

### 🆕 **enter.pollinations.ai** (NEW - Beta)

Our new centralized authentication and model gateway:

-   **Status**: Beta - actively being rolled out
-   **Features**: Unified authentication, pollen-based billing, all models in one place
-   **Authentication**: Publishable keys (`pk_`) and Secret keys (`sk_`)
-   **Endpoints** (transitional - will be simplified):
    -   `/api/generate/image/*` - Image generation with all models
    -   `/api/generate/openai` - OpenAI-compatible text/audio endpoints
    -   `/api/generate/text/*` - Simple text generation
-   **Documentation**: See `enter.pollinations.ai/MODEL-TESTING-CHEATSHEET.md`
-   **Best for**: New integrations, testing, production-ready features
-   **Note**: Current endpoint structure is transitional and will be simplified in future releases

### 🔄 **Legacy APIs** (OLD - Being Phased Out)

-   **image.pollinations.ai** - Direct image generation (no auth validation)
-   **text.pollinations.ai** - Direct text generation (no auth validation)
-   **Status**: Image/text services operational but authentication removed; all auth now via enter.pollinations.ai
-   **Migration**: All new features are being built on enter.pollinations.ai

**For Agents**: When working on API-related tasks, clarify whether you're working with:

1. **New system** (enter.pollinations.ai) - preferred for new work
2. **Legacy system** (image/text.pollinations.ai) - maintenance only

Both systems are currently functional, but new development should target enter.pollinations.ai.

## Model Context Protocol (MCP)

The `model-context-protocol/` directory contains a Model Context Protocol server that allows AI agents to directly generate images, text, and audio using the Pollinations API.

For detailed implementation notes, design principles, and troubleshooting, see:

-   `model-context-protocol/README.md` - Installation and usage
-   `model-context-protocol/AGENTS.md` - Implementation guidelines and debugging

## API Quick Reference

### Image Generation

```
GET https://image.pollinations.ai/prompt/{prompt}
Parameters: model, seed, width, height, nologo, private, enhance, safe
```

### Text Generation

```
GET https://text.pollinations.ai/{prompt}
POST https://text.pollinations.ai/
Parameters: model, seed, json, system
```

### Audio Generation

```
GET https://text.pollinations.ai/{prompt}?model=openai-audio&voice={voice}
POST https://text.pollinations.ai/
Body: messages*, model (set to "openai-audio"), voice (optional)
```

### Testing & Operations Documentation

-   **[Model Testing Cheatsheet](enter.pollinations.ai/AGENTS.md)** - Comprehensive guide for testing all image and text models via enter.pollinations.ai API
-   **[Enter Services Deployment](.claude/skills/enter-services/SKILL.md)** - Deploy and manage text/image services on AWS EC2

## Development Guidelines

1. Code Style:

    - Use modern JavaScript/TypeScript features
    - Use ES modules (import/export) - all .js files are treated as ES modules
    - Follow existing code formatting patterns
    - Add descriptive comments for complex logic

2. Testing:

    - Add tests for new features in appropriate test directories
    - Follow existing test patterns in /test directories
    - **Test with real production code, not mocks** - Tests should validate actual behavior
    - Avoid creating mock infrastructure - use direct function imports instead

3. Documentation:

    - Update API docs for new endpoints
    - Add JSDoc comments for new functions
    - Update README.md for user-facing changes
    - **Avoid creating markdown documentation files while working** unless explicitly requested
    - If temporary files are needed for testing/debugging, create them in a `temp/` folder clearly labeled as temporary

4. YAGNI Principle (You Aren't Gonna Need It):

    - **Don't keep code for "potential futures"** - Only implement what's needed now
    - Remove unused functions, even if they "might be useful someday"
    - If we need something later, we'll add it when we actually need it
    - Example: Don't create test utilities or helper functions "just in case"
    - Keep the codebase minimal and focused on current requirements

5. Architecture Considerations:

    - Frontend changes should be in pollinations.ai/
    - Image generation in image.pollinations.ai/
    - Text generation in text.pollinations.ai/
    - React components in pollinations-react/
    - AI assistant integrations in model-context-protocol/

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

-   If the user asks to send to git or something similar do all these steps:
-   Git status, diff, create branch, commit all, push and write a PR description

## Communication Style

**All PRs, comments, issues: bullet points, <200 words, no fluff**

**PR Format:**

-   Use "- Adds X", "- Fix Y" format
-   3-5 bullets for most PRs
-   Simple titles: "fix:", "feat:", "Add"
-   Reference: `repo:pollinations/pollinations author:eulervoid`

## GitHub Labels

-   Only use established labels (check with `mcp1_list_issues`)
-   Avoid creating new labels unless part of broader strategy
-   Keep names consistent with existing patterns

## Contributor Attribution

**Commit format:**

```
feat: add feature

Co-authored-by: username <user_id+username@users.noreply.github.com>
Fixes #issue
```

-   Use "Fixes #issue" or "Addresses #issue" in PR descriptions
-   Email format: `{username} <{user_id}+{username}@users.noreply.github.com>`
-   Find user_id in issue API response
