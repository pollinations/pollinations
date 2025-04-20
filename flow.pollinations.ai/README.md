# Pollinations Flow

A unified authentication and Model Context Protocol (MCP) server for Pollinations.AI services.

<p align="center">
  <img src="./src/public/img/logo.svg" alt="Pollinations Flow Logo" width="120" height="120">
</p>

## Overview

Pollinations Flow is a central authentication service for Pollinations.AI that uses GitHub as an identity provider while offering two authentication methods:

1. **Referrer-based authentication** - Automatically authenticate based on whitelisted domains
2. **Token-based authentication** - Use a personal access token directly with Pollinations services

The service also implements a Server-Sent Events (SSE) based Model Context Protocol (MCP) server that allows AI assistants to access authentication tools.

## Features

- **GitHub OAuth Integration** - Secure authentication using GitHub as an identity provider
- **Dual Authentication Methods** - Choose between referrer-based or token-based authentication
- **Referrer Management** - Control which domains can use your GitHub identity
- **Token Management** - Generate and manage personal access tokens
- **SSE MCP Server** - Model Context Protocol implementation for AI assistants
- **Responsive UI** - Modern, mobile-friendly user interface

## Installation

### Prerequisites

- Node.js 16 or higher
- npm or yarn
- A GitHub OAuth application (for authentication)

### Setup

1. Clone the repository:

```bash
git clone https://github.com/pollinations/pollinations.git
cd pollinations/flow.pollinations.ai
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

4. Edit the `.env` file and fill in the required configuration values:

```
# Server Configuration
PORT=3000
NODE_ENV=development

# GitHub OAuth
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=https://flow.pollinations.ai/github/callback

# Session & Security
SESSION_SECRET=your_random_session_secret
COOKIE_SECRET=your_random_cookie_secret
COOKIE_SECURE=true
COOKIE_HTTP_ONLY=true

# Domain configuration
APP_DOMAIN=flow.pollinations.ai

# Storage configuration
STORAGE_PATH=./data/user_storage.json
```

5. Create a GitHub OAuth application:
   - Go to GitHub Settings > Developer Settings > OAuth Apps > New OAuth App
   - Set the Homepage URL to `https://flow.pollinations.ai`
   - Set the Authorization callback URL to `https://flow.pollinations.ai/github/callback`
   - Copy the Client ID and Client Secret to your `.env` file

6. Start the server:

```bash
npm start
```

## Usage

### User Interface

The Flow service provides a user-friendly web interface at `https://flow.pollinations.ai` where users can:

1. Sign in with GitHub
2. View and manage their Pollinations token
3. Add and remove authorized referrer domains
4. Get code examples for using their token

### Authentication Methods

#### Referrer-Based Authentication

When a user visits a domain that's in their authorized referrers list, they are automatically authenticated with Pollinations services. This is useful for websites and applications that integrate with Pollinations.

To use referrer-based authentication:

1. Sign in with GitHub on Flow
2. Add your domain to the authorized referrers list
3. When making requests from your domain, include the Origin or Referer header

#### Token-Based Authentication

Users can also authenticate directly with Pollinations services using their personal access token. This is useful for programmatic access or for services that can't use referrer-based authentication.

To use token-based authentication:

1. Sign in with GitHub on Flow
2. Copy your Pollinations token
3. Include the token in your requests to Pollinations services using:
   - The `X-Pollinations-Token` header
   - A `token` query parameter
   - A `token` field in the request body (for POST requests)

### API Endpoints

#### Authentication Endpoints

- `GET /github/login` - Start GitHub OAuth flow
- `GET /github/callback` - GitHub OAuth callback
- `GET /status` - Check authentication status
- `GET /logout` - Sign out

#### Token Management

- `POST /token/regenerate` - Generate a new Pollinations token (invalidates the old one)

#### Referrer Management

- `GET /referrers` - List authorized referrers
- `POST /referrer` - Add a referrer (`{ "referrer": "example.com" }`)
- `DELETE /referrer` - Remove a referrer (`{ "referrer": "example.com" }`)

#### MCP Server

- `GET /mcp` - SSE endpoint for MCP connections

### MCP Tools

The Flow MCP server provides the following authentication tools:

#### Authentication Tools

- `isAuthenticated({ sessionId })` - Check if a user is authenticated
- `getAuthUrl({ returnUrl })` - Get a URL for GitHub authentication
- `getToken({ sessionId })` - Get or generate a token for an authenticated user

#### Referrer Management Tools

- `listReferrers({ sessionId })` - List authorized referrers for a user
- `addReferrer({ sessionId, referrer })` - Add a referrer to a user's whitelist
- `removeReferrer({ sessionId, referrer })` - Remove a referrer from a user's whitelist

## Integration with Other Pollinations Services

### Image Generation

```javascript
// Using token-based authentication
fetch('https://image.pollinations.ai/prompt/beautiful%20sunset', {
  headers: {
    'X-Pollinations-Token': 'YOUR_TOKEN'
  }
})
.then(response => response.json())
.then(data => console.log(data));
```

### Text Generation

```javascript
// Using token-based authentication
fetch('https://text.pollinations.ai/Hello%20world', {
  headers: {
    'X-Pollinations-Token': 'YOUR_TOKEN'
  }
})
.then(response => response.text())
.then(data => console.log(data));
```

## Security Considerations

- Tokens are stored in the `data/user_storage.json` file
- Tokens are not encrypted in this implementation, so ensure the storage file is properly secured
- For production, consider implementing token encryption at rest
- The service uses GitHub OAuth for authentication, so users don't need to create separate accounts

## Development

### Project Structure

```
flow.pollinations.ai/
├── src/
│   ├── auth/           # Authentication components
│   ├── mcp/            # MCP server implementation
│   ├── storage/        # Token and referrer storage
│   ├── public/         # Frontend UI
│   └── server.js       # Main server file
├── data/               # Data storage
├── .env.example        # Example environment variables
└── package.json        # Dependencies and scripts
```

### Adding New Features

To add new features to the Flow service:

1. Authentication components should be added to the `src/auth` directory
2. MCP tools should be added to the `src/mcp/toolSchemas.js` file
3. Frontend UI should be added to the `src/public` directory

## License

MIT License - See LICENSE file for details

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Acknowledgements

- Developed for Pollinations.AI
- Uses the Model Context Protocol for AI assistant integration
