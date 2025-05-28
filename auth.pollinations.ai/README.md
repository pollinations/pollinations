# GitHub Auth Simple 🔐

A minimal GitHub OAuth proxy for Pollinations. Clean, simple, and session-based.

## Features ✨

- GitHub OAuth flow
- Session-based authentication
- Domain allowlist management
- User tier system (Seed, Flower, Nectar)
- Automatic token expiration handling
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

### Protected (Auth required)
- `GET /api/user` - Get current user
- `GET /api/domains?user_id=...` - Get domain allowlist
- `POST /api/domains?user_id=...` - Update domain allowlist
- `GET /api/check-domain?user_id=...&domain=...` - Check if domain is allowed

### User Tier Endpoints
- `GET /api/user-tier?user_id=...` - Get a user's tier
- `POST /api/user-tier` - Set a user's tier (admin only)
- `GET /api/user-tiers` - Get all users with their tiers (admin only)

## Testing 🧪

```bash
node test.js
```

## Deployment 🌍

### Standard Deployment
```bash
npm run deploy
```

### Deployment with Migrations (Recommended)
This ensures database migrations are applied before deployment, which is essential for the tier system to work properly.

```bash
npm run deploy:with-migrations
```

## Architecture 🖥️

### Server Components
- **index.ts** - Simple route handlers
- **db.ts** - Database operations
- **github.ts** - GitHub OAuth helpers
- **types.ts** - TypeScript interfaces

### Client UI
- **client/html.ts** - HTML templates
- **client/styles.ts** - CSS styling
- **client/scripts.ts** - Client-side JavaScript

That's it! No bloat, no complexity. Just auth. 🎯
