# gen.pollinations.ai - API Gateway Service

Lightweight API gateway for text generation, extracted from enter.pollinations.ai.

## Architecture

- **API Gateway**: Proxies requests to text.pollinations.ai
- **Authentication**: Validates API keys from shared D1 database
- **Event Logging**: Logs generation events for billing/analytics (processed by enter.pollinations.ai)
- **Shared Database**: Uses same D1 database as enter.pollinations.ai

## Endpoints

### Public
- `GET /openai/models` - List available text models

### Authenticated (Bearer token required)
- `POST /openai` - OpenAI-compatible chat completions
- `POST /v1/chat/completions` - Alternative endpoint

## Development

```bash
# Install dependencies
npm install

# Run locally
npm run dev

# Deploy to staging
npm run deploy:staging

# Deploy to production
npm run deploy:production
```

## Environment Variables

Set in `wrangler.toml`:
- `TEXT_SERVICE_URL` - Backend text service (default: https://text.pollinations.ai)
- `ENVIRONMENT` - development/staging/production

## Shared Database

Uses same D1 database bindings as enter.pollinations.ai:
- Development: `development-pollinations-enter-db`
- Staging: `staging-pollinations-enter-db`
- Production: `production-pollinations-enter-db`

## Separation of Concerns

### gen.pollinations.ai (this service)
- API key validation (read from D1)
- Request proxying
- Basic event logging (write to D1)

### enter.pollinations.ai
- OAuth flows, session management
- API key CRUD operations
- User dashboard UI
- Event processing (Polar billing, Tinybird analytics)
- Subscription management

## Related Services

- [enter.pollinations.ai](../enter.pollinations.ai/) - Auth & user management
- [text.pollinations.ai](../text.pollinations.ai/) - Text generation backend
- [shared/](../shared/) - Shared utilities & database schema
