# Claude Guidelines for Pollinations.AI

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

   **Requirements:**
   - ✅ **Project URL is REQUIRED** - Must have a working live demo or website
   - ✅ **GitHub repo is OPTIONAL** - Nice to have but not required
   - ❌ **Invalid submissions** - No URL, broken URL, or just image generation requests

3. Project Ordering Rules:
   - In the README.md file, projects should be ordered within their categories:
     - First by the `order` parameter (lower values first: 1, 2, 3, 4, 5)
     - Then by GitHub star count (higher star counts first)
     - For projects with the same order and no stars, use the submission date if there is one, if not keep the order as it is.
   - In the website rendering, the projectList.js order will be dynamically sorted using the same criteria so the actual order in the projectList.js file should not be changed

4. Hiding Broken Projects:
   - Use the `hidden: true` parameter to mark projects that are broken or no longer maintained
   - Projects with this flag will not be displayed in the README.md project listings
   - They will still remain in the projectList.js as the source of truth

5. GitHub Star Counts:
   - For projects with GitHub repositories, add their star count as a `stars` property:
     ```javascript
     {
       name: "Project Name",
       // other properties...
       repo: "https://github.com/owner/repo",
       stars: 1234  // Add this property for GitHub repos
     }
     ```
   - Use the update-project-stars.js script to get current counts:
     ```bash
     # For a specific repository:
     node .github/scripts/update-project-stars.js owner/repo

     # To update all repositories in projectList.js:
     node .github/scripts/update-project-stars.js
     ```
   - The star count will be displayed on the project page next to the GitHub link

6. Categories (as of June 2025):
   - Vibe Coding ✨ (`vibeCoding.js`): No-code / describe-to-code playgrounds and builders
   - Creative 🎨 (`creative.js`): Turn prompts into images, video, music, design, slides
   - Games 🎲 (`games.js`): AI-powered play, interactive fiction, puzzle & agent worlds
   - Hack-&-Build 🛠️ (`hackAndBuild.js`): SDKs, integration libs, extensions, dashboards, MCP servers
   - Chat 💬 (`chat.js`): Standalone chat UIs / multi-model playgrounds
   - Social Bots 🤖 (`socialBots.js`): Discord / Telegram / WhatsApp / Roblox bots & NPCs
   - Learn 📚 (`learn.js`): Tutorials, guides, style books & educational demos
   - (Tracking file: `tracking/toProcess.md` for workflow management)

## Classification Guidelines (2025 Update)
- Each project must be assigned to only **one** category file (no duplicates).
- Category assignment is based on actual functionality and metadata, not just the source JSON category.
- When a project fits multiple categories, prefer less-populated categories (games, hackAndBuild, learn, socialBots, vibeCoding) to maintain balance.
- Educational/interactive learning tools go to `learn.js`.
- SDKs, APIs, and toolkits go to `hackAndBuild.js`.
- Creative tools (image, text, audio generation, etc.) go to `creative.js`.
- Chatbots and conversational agents go to `chat.js`.
- Games and interactive fiction go to `games.js`.
- Social platform bots go to `socialBots.js`.
- No placeholder entries remain in category files; all projects are tracked in `toProcess.md` until categorized.
- After categorization, update `toProcess.md` to reflect the assignment (e.g., "added to creative.js").
- Use project metadata from `accumulated-projects.json` as the source of truth.

## Current Workflow Summary
1. Review uncategorized projects listed in `tracking/toProcess.md`.
2. For each, inspect metadata in `accumulated-projects.json`.
3. Assign to the most appropriate category file, following the above rules.
4. Update both the category file and `toProcess.md` incrementally.
5. Avoid duplicates and maintain category balance.
6. If a project lacks sufficient detail, remove or defer it from the tracking list.
7. All decisions and reassignments should be consistent and documented.
8. This workflow ensures a clean, organized, and up-to-date project classification for Pollinations.AI.

7. Add appropriate UTF-8 icons to titles where relevant (🤖 for bots, 🎨 for creative apps, etc.)

8. For projects in non-English languages:
   - Add a country flag emoji to the project name (e.g., 🇨🇳 for Chinese, 🇪🇸 for Spanish)
   - Include the "language" field in the project entry with the appropriate language code
   - Add an English translation of the description in parentheses when possible
   - This helps users easily identify and filter projects by language

9. When creating a commit for project submissions, always add attribution to the issue creator using a Co-authored-by line in the commit message:
    ```
    Add [Project Name] to project list

    Added [Project Name] to the [Category] category in both:
    - README.md
    - pollinations.ai/src/config/projectList.js

    [Brief description of the project]

    Co-authored-by: [GitHub-Username] <[GitHub-Email]>
    Closes #[Issue-Number]
    ```
    - The Co-authored-by line must follow GitHub's format exactly
    - If you don't have the user's GitHub email, you can try to find it in their previous commits or ask them for it
    - This ensures the issue creator gets proper credit for their contribution in GitHub's graph

## Repository Structure

Key directories and their purposes:

```
pollinations/
├── image.pollinations.ai/     # Image generation backend service
├── text.pollinations.ai/      # Text generation backend service
├── pollinations.ai/           # Main React frontend application
├── pollinations-react/        # React component library
├── model-context-protocol/    # MCP server for AI assistant integration
└── operations/                # Documentation and operations
```

## Model Context Protocol (MCP)

The `model-context-protocol/` directory contains a Model Context Protocol server that allows AI assistants like Claude to directly generate images using the Pollinations API. Key components:

- `pollinations-api-client.js`: Core API client with functions for image/audio generation and model listing
- `pollinations-mcp-server.js`: MCP server implementation that handles tool requests
- `CLAUDE_INSTALLATION.md`: Instructions for setting up with Claude Desktop
- `test-mcp-client.js`: Test script for verifying functionality

The MCP server provides a standardized way for AI assistants to access Pollinations' services without requiring users to manually copy/paste URLs or handle image generation directly.

### MCP Design Principles

1. **Thin Proxy Design**: The MCP server functions as a thin proxy for Pollinations services:
   - Minimal processing of data between client and API
   - No transformation or normalization of responses
   - Direct pass-through of streams when applicable
   - No unnecessary logic to verify return types or add metadata

2. **API Functions**:
   - `generateImageUrl`: Returns a URL to the generated image
   - `generateImage`: Returns the actual image data as base64-encoded string
   - `generateAudio`: Returns audio data as base64-encoded string
   - `listModels`: Returns available models for image or text generation

3. **Dependencies**:
   - `@modelcontextprotocol/sdk`: Core MCP SDK (version 1.7.0+)
   - `play-sound`: For audio playback functionality
   - `node-fetch`: For making HTTP requests

## MCP Server Implementation Notes

### Important Considerations

1. **Stdio Communication**: The MCP server communicates with Claude Desktop via stdio. This means:
   - Never use `console.log()` in any code that's imported by the MCP server, as it will interfere with the JSON communication protocol
   - Always use `console.error()` for debugging, but be aware that excessive logging can still cause issues
   - When testing outside of Claude, you can use `console.log()` freely

2. **Response Format**:
   - All tool responses to Claude must be properly formatted JSON
   - For text responses, wrap them in a JSON structure and use `JSON.stringify()` before returning
   - Follow the pattern used by existing functions like `generateImageUrl` and `listModels`

3. **Audio Implementation**:
   - Audio is generated via the text.pollinations.ai service
   - The MCP server plays audio locally on the system rather than trying to return audio data to Claude
   - The `play-sound` package is used for local audio playback

4. **Thin Proxy Design**:
   - The Pollinations API client should function as a thin proxy
   - Avoid transforming or processing stream data
   - Don't add unnecessary metadata or normalizations
   - Keep the code simple and avoid unnecessary operations

5. **Debugging**:
   - Check the logs at `/Users/thomash/Library/Logs/Claude/mcp-server-pollinations.log` for errors
   - Test MCP functions independently using the test-mcp-client.js script
   - Remember to restart Claude Desktop after making changes to the MCP server

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
   - Keep this .mentat/README.md up to date with new features, functionality, or important project maintenance information
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

## Important Context

Pollinations.AI is:
- 100% Open Source
- Free to use
- Privacy-focused (no logins, no keys, no data stored)
- Used by 50,000+ active users
- Processing 20M+ images monthly

Core Values:
- Open & Accessible
- Transparent & Ethical
- Community-Driven
- Interconnected
- Evolving

Remember these principles when implementing changes or reviewing submissions.

# Git Workflow
- If the user asks to send to git or something similar do all these steps:
- Git status, diff, create branch, commit all, push and write a PR description

## VERY IMPORTANT: Concise Communication Style

**ALL PRs, comments, and issues must be concise and use bullet points.** This is critical for:
- Readability and quick scanning
- Respecting reviewer time
- Maintaining consistency across the project
- Following @eulervoid's established style

### DO:
- Use bullet points for lists
- Keep comments under 200 words
- One idea per bullet
- Remove unnecessary words
- Be direct and clear

### DON'T:
- Write long paragraphs
- Use verbose explanations
- Repeat the same point multiple ways
- Add marketing language or fluff

## PR Description Style Guide

When creating PR descriptions, follow the concise style used by @eulervoid:

**Key Principles:**
1. **Bullet points over paragraphs** - Use "- Adds X", "- Fix Y" format
2. **Minimal but clear** - 3-5 bullet points for most PRs
3. **No marketing fluff** - Just the facts
4. **Simple titles** - Clear, with optional prefix like "fix:", "feat:", "Add"

**Reference Examples:**
- Search GitHub for `repo:pollinations/pollinations author:eulervoid` to see style
- Example PR: https://github.com/pollinations/pollinations/pull/4039
  ```
  - **Add logging and cost/price calculation**
  - **Add models/services to registry**
  - **Add tests for model/service registry and cost/price calculations**
  - **Add fixtures for signIn and creating an api key, add tests for calling all defined models**
  - **Add test to ensure only free services are available without API key**
  - **Add tinybird cli to flake.nix**
  ```

**When to be more detailed:**
- Complex architectural changes
- Breaking changes
- New features requiring explanation
- But still keep it concise and structured

## GitHub Labels Best Practices

When creating or applying labels to issues:

1. **Check label usage before applying**:
   - Search existing issues to see if a label is actively used
   - Use `mcp1_list_issues` with the label to verify it's not a new/unused label
   - Only apply labels that are already established in the repository
   - Avoid creating new labels unless they're part of a broader labeling strategy

2. **Label consistency**:
   - Use existing labels from the repository
   - Keep label names consistent with established patterns
   - If creating new labels, ensure they'll be reused across multiple issues

## Contributor Attribution in PRs

When addressing issues opened by external contributors:

1. **Add Co-authored-by in commit messages**:
   ```
   docs: add reasoning model warning
   
   Addresses feedback from issue #1842
   
   Co-authored-by: withthatway <69885286+withthatway@users.noreply.github.com>
   ```

2. **Reference issues in PR descriptions**:
   - Use "Fixes #issue" or "Addresses #issue" to link PRs to issues
   - Mention the issue reporter by username when relevant
   - This ensures contributors get proper credit in GitHub's contribution graph
   - Keep descriptions concise (see @eulervoid's PR style above)

3. **Finding contributor emails**:
   - Use format: `{username} <{user_id}+{username}@users.noreply.github.com>`
   - User ID can be found in the issue API response
   - Example: `withthatway <69885286+withthatway@users.noreply.github.com>`