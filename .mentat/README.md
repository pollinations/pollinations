# Mentat Bot Guidelines for Pollinations.AI

## Project Submission Handling

When handling project submission issues:

1. Add new projects to the top of the appropriate section in:
   - README.md under the "Projects Using Pollinations.AI" section
   - pollinations.ai/src/config/projectList.js in the corresponding category array
   - add a UTF8 icon higlighting them as new additions

2. Project Entry Format:
   ```javascript
   {
     name: "Project Name",
     url: "https://project-url.com",
     description: "Brief description of the project.",
     author: "@discord_username", // if available or alternatively a URL to a social media profile
     repo: "https://github.com/repo-url", // if available
     submissionDate: "YYYY-MM-DD", // automatically added for new submissions
     language: "zh-CN" // for non-English projects, include the language code
   }
   ```

3. Categories:
   - LLM Integrations
   - Creative & Interactive Applications
   - Tools & Interfaces
   - Social Bots
   - SDK & Libraries
   - Tutorials

4. Add appropriate UTF-8 icons to titles where relevant (🤖 for bots, 🎨 for creative apps, etc.)

5. For projects in non-English languages:
   - Add a country flag emoji to the project name (e.g., 🇨🇳 for Chinese, 🇪🇸 for Spanish)
   - Include the "language" field in the project entry with the appropriate language code
   - Add an English translation of the description in parentheses when possible
   - This helps users easily identify and filter projects by language

## Repository Structure

Key directories and their purposes:

```
pollinations/
├── image.pollinations.ai/     # Image generation backend service
├── text.pollinations.ai/      # Text generation backend service
├── pollinations.ai/           # Main React frontend application
├── pollinations-react/        # React component library
└── operations/               # Documentation and operations
```

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

## Development Guidelines

1. Code Style:
   - Use modern JavaScript/TypeScript features
   - Use ES modules (import/export) - all .js files are treated as ES modules
   - Follow existing code formatting patterns
   - Add descriptive comments for complex logic

2. Testing:
   - Add tests for new features in appropriate test directories
   - Follow existing test patterns in /test directories

3. Documentation:
   - Update API docs for new endpoints
   - Add JSDoc comments for new functions
   - Update README.md for user-facing changes

4. Architecture Considerations:
   - Frontend changes should be in pollinations.ai/
   - Image generation in image.pollinations.ai/
   - Text generation in text.pollinations.ai/
   - React components in pollinations-react/

5. Security:
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