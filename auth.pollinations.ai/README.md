# GitHub Auth Simple 🔐

A minimal GitHub OAuth proxy for Pollinations. Clean, simple, and JWT-based.

## Features ✨

- GitHub OAuth flow
- JWT token generation
- Domain allowlist management
- Zero complexity, pure simplicity

## Setup 🚀

1. Copy `.dev.vars.example` to `.dev.vars`
2. Add your GitHub OAuth app credentials
3. Generate a JWT secret: `openssl rand -base64 32`

```bash
npm install
npm run dev
```

## API Endpoints 📡

### Public
- `GET /authorize?redirect_uri=...` - Start OAuth flow
- `GET /callback` - GitHub OAuth callback

### Protected (JWT required)
- `GET /api/user` - Get current user
- `GET /api/domains?user_id=...` - Get domain allowlist
- `POST /api/domains?user_id=...` - Update domain allowlist
- `GET /api/check-domain?user_id=...&domain=...` - Check if domain is allowed

## Testing 🧪

```bash
node test.js
```

## Deployment 🌍

```bash
npm run deploy
```

## Architecture 🏗️

- **index.ts** - Simple route handlers
- **jwt.ts** - JWT creation/verification
- **db.ts** - Database operations
- **github.ts** - GitHub OAuth helpers
- **types.ts** - TypeScript interfaces

That's it! No bloat, no complexity. Just auth. 🎯
