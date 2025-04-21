# Pollinations MCP Server Handlers

This directory contains the handler modules for the Pollinations Model Context Protocol (MCP) server. These handlers follow the "thin proxy" design principle, focusing on routing requests to the appropriate services with minimal data transformation.

## Handler Modules

### `apiAuthHandlers.js`

Provides handlers for API authentication endpoints:

- `handleVerifyToken`: Verifies API tokens for authenticated access
- `handleVerifyReferrer`: Verifies if a referrer is authorized for a user
- `handleHealthCheck`: Simple health check endpoint

### `githubAuthHandlers.js`

Implements GitHub OAuth authentication flow:

- `handleGithubLogin`: Initiates the GitHub OAuth flow
- `handleGithubCallback`: Processes the GitHub OAuth callback

### `sseHandlers.js`

Handles Server-Sent Events (SSE) connections:

- `handleSseConnection`: Establishes an SSE connection for server-to-client streaming

## Design Principles

1. **Thin Proxy**: Handlers act as thin proxies, minimizing data transformation and processing
2. **Separation of Concerns**: Authentication, transport, and business logic are separated
3. **Modularity**: Each handler module focuses on a specific aspect of the server
4. **Reusability**: Handler functions can be composed and reused in different server configurations

## Usage

The handlers are designed to be used with Express.js routes. They are created using factory functions that accept dependencies, following the dependency injection pattern:

```javascript
// Example usage in an Express app
import { createGithubAuthHandlers } from './handlers/githubAuthHandlers.js';
import { createApiAuthHandlers } from './handlers/apiAuthHandlers.js';

const app = express();

const { handleGithubLogin, handleGithubCallback } = createGithubAuthHandlers({
  clientId: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  redirectUri: process.env.REDIRECT_URI
});

app.get('/github/login', handleGithubLogin);
app.get('/github/callback', handleGithubCallback);
```
