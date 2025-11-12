# Model Viewer with Uptime Monitoring

Feature-rich viewer for Pollinations AI models with **backend-based** real-time uptime monitoring.

## Features

- **17+ AI Models** - Dynamically fetched from API
- **Backend Uptime Monitoring** - Cloudflare Workers service tracks model availability 24/7
- **Real-time Status** - Visual history bars and percentage tracking
- **AI Insights** - Curated descriptions for each model
- **Advanced Filters** - Search, filter by tier/capabilities, multiple view modes

## Architecture

### Frontend (`index.html`, `script.js`, `styles.css`)
Pure HTML/CSS/JS viewer - fetches models dynamically, displays uptime from backend

### Backend (Cloudflare Workers)
- **Primary**: `worker.js` - Cloudflare Workers implementation (recommended)
- **Alternative**: `uptime-backend.js` - Node.js Express server (for local dev)

Cloudflare Worker runs on a cron schedule (every 5 minutes), checks all models, stores data in KV.

## Deployment

### Cloudflare Workers (Recommended)

```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create KV namespace
wrangler kv:namespace create "UPTIME_DATA"

# Update wrangler.toml with your KV namespace ID

# Deploy worker
wrangler deploy
```

The worker will:
1. Run every 5 minutes via cron trigger
2. Fetch models from Pollinations APIs dynamically
3. Check each model's availability
4. Store results in Cloudflare KV
5. Serve API endpoints for frontend

### Local Development

```bash
# Use Node.js backend for local testing
npm install
npm start

# Or use Wrangler dev mode
wrangler dev
```

## Frontend Deploy

Deploy to any static host (GitHub Pages, Netlify, Cloudflare Pages, etc.)

Update `UPTIME_BACKEND` in `script.js` to point to your deployed worker URL.

## API Endpoints

- `GET /api/uptime` - All models
- `GET /api/uptime/:modelName` - Specific model with %
- `POST /api/uptime/:modelName` - Manual check recording

## Configuration

In `script.js`, set your worker URL:
```javascript
const UPTIME_BACKEND = 'https://pollinations-uptime-monitor.your-subdomain.workers.dev';
```

## Data Storage

Cloudflare Workers KV stores uptime data:
- 24 hours of history (288 data points @ 5min intervals)
- Automatic cleanup of old data
- Global edge distribution
