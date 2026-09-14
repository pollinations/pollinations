# NPC Memory Agent

A production-ready NPC companion who remembers users across conversations. Built as a **code agent** using the Computer MCP for persistent, per-user memory storage.

## Features

- **Cross-session memory** — Remembers facts across fresh chat histories
- **Auto-extraction** — LLM extracts structured facts from natural conversation
- **Memory management** — REST API for show, add, update, forget, list memories
- **User isolation** — Each user gets their own memory namespace (enforced by Computer MCP)
- **Fully variabilized** — Zero hardcoded values, everything via environment variables
- **Production-ready** — Docker, healthcheck, structured logging, graceful shutdown
- **Simple web UI** — Built-in HTML chat interface

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        NPC Memory Agent                         │
├─────────────────────────────────────────────────────────────────┤
│  HTTP Server (FastAPI)                                          │
│  ├── GET  /health                                               │
│  ├── POST /chat          — Send message, get NPC response       │
│  ├── GET  /memory/{user} — List all memories for a user         │
│  ├── DELETE /memory/{user}/{key} — Forget specific memory       │
│  └── GET  /               — Web chat interface                  │
├─────────────────────────────────────────────────────────────────┤
│  Memory Engine                                                  │
│  ├── Auto-extraction via LLM (structured facts from text)       │
│  ├── Conflict resolution (updates overwrite, preserves history)  │
│  ├── Memory quality (specificity, categorization, concision)    │
│  └── Retention policies (max memories, auto-prune)              │
├─────────────────────────────────────────────────────────────────┤
│  Computer MCP Client                                            │
│  ├── Read/Write /workspace/memory/facts.md                      │
│  ├── Append to /workspace/memory/log/YYYY-MM-DD.md              │
│  └── Per-user Durable Object isolation                          │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Clone and setup
git clone https://github.com/pollinations/pollinations.git
cd pollinations/apps/npc-memory-agent

# Configure (copy and edit)
cp .env.example .env
# Edit .env with your values

# Run with Docker
docker compose up -d

# Or run locally
pip install -r requirements.txt
python npc_agent.py
```

## Environment Variables

All configuration is via environment variables. See `.env.example` for the full list.

| Variable | Default | Description |
|----------|---------|-------------|
| `NPC_HOST` | `0.0.0.0` | Server bind address |
| `NPC_PORT` | `8080` | Server port |
| `NPC_BASE_MODEL` | `openai` | LLM model for responses |
| `NPC_MEMORY_MODEL` | `openai` | LLM model for fact extraction |
| `NPC_MAX_MEMORIES` | `100` | Max memories per user |
| `NPC_MEMORY_PRUNE_DAYS` | `90` | Auto-prune memories older than N days |
| `NPC_PERSONALITY` | `warm,curious,playful` | NPC personality traits |
| `NPC_LANGUAGE` | `en` | Default language |
| `NPC_LOG_LEVEL` | `INFO` | Logging level |
| `NPC_COMPUTER_MCP_URL` | `http://localhost:8787` | Computer MCP endpoint |
| `NPC_COMPUTER_MCP_HEADER` | `x-pollinations-user-id` | User identification header |
| `NPC_AGENT_NAME` | `npc-memory-agent` | Agent identifier |
| `NPC_AGENT_TITLE` | `NPC Memory Agent` | Display name |
| `NPC_AGENT_DESCRIPTION` | (see .env.example) | Agent description |
| `NPC_CORS_ORIGINS` | `*` | Allowed CORS origins |
| `NPC_RATE_LIMIT` | `60/minute` | Rate limit per user |

## Memory System

### Facts File (`/workspace/memory/facts.md`)
```markdown
# User Memory: {user_id}

## Identity
- Name: {name}
- First seen: {timestamp}
- Last interaction: {timestamp}

## Preferences
- Likes: {list}
- Dislikes: {list}

## Context
- Projects: {list}
- Interests: {list}

## Notes
- {fact} (added: {timestamp})
- {fact} (added: {timestamp})
```

### Journal (`/workspace/memory/log/YYYY-MM-DD.md`)
```markdown
# Journal: {user_id} — {date}

## {timestamp}
- {event description}
- Action: {remembered|forgotten|updated}
```

### Memory Operations

| Operation | Trigger | Action |
|-----------|---------|--------|
| **Create** | First conversation | Initialize facts.md, ask name |
| **Extract** | User shares fact | LLM extracts key-value, writes to facts.md |
| **Update** | Preference changes | Overwrites old value, appends to journal |
| **Forget** | User requests deletion | Removes specific fact, logs to journal |
| **Prune** | Scheduled (configurable) | Removes stale memories per policy |

## API Reference

### POST /chat
Send a message and get the NPC response.

```bash
curl -X POST http://localhost:8080/chat \
  -H "Content-Type: application/json" \
  -d '{"user_id": "user123", "message": "Hi, I am Alex and I love hiking"}'
```

Response:
```json
{
  "user_id": "user123",
  "response": "Hey Alex! 🥾 Hiking is awesome! What kind of trails do you like?",
  "memories_extracted": [
    {"key": "name", "value": "Alex", "action": "created"},
    {"key": "interests", "value": "hiking", "action": "created"}
  ]
}
```

### GET /memory/{user}
List all memories for a user.

```bash
curl http://localhost:8080/memory/user123
```

### DELETE /memory/{user}/{key}
Forget a specific memory.

```bash
curl -X DELETE http://localhost:8080/memory/user123/name
```

## Testing Persistence

```bash
# 1. Share some facts
curl -X POST http://localhost:8080/chat \
  -d '{"user_id": "test", "message": "I am Bob, I like pizza and coding"}'

# 2. Open a NEW session (same user_id, no chat history)
curl -X POST http://localhost:8080/chat \
  -d '{"user_id": "test", "message": "Hello!"}'
# NPC should respond: "Hey Bob! How's the coding going? Still loving pizza?"

# 3. Show memories
curl http://localhost:8080/memory/test

# 4. Forget something
curl -X DELETE http://localhost:8080/memory/test/preferences/likes/pizza

# 5. Verify isolation — different user has no memories
curl http://localhost:8080/memory/other_user
```

## Deployment

### Docker Compose
```yaml
services:
  npc-agent:
    build: .
    ports:
      - "8080:8080"
    env_file: .env
    restart: unless-stopped
```

### Cloudflare Worker
```bash
npm install
npx wrangler deploy
```

### Pollinations Staging
1. Fork the repo
2. Go to https://staging.enter.pollinations.ai/my-models
3. Choose **Add Agent → Code Agent**
4. Enter your fork URL
5. Set the sync variable:
   `POLLINATIONS_SYNC_URL=https://staging.gen.pollinations.ai/account/agents/YOUR_AGENT_ID/sync`

## Configuration Example

```bash
# .env
NPC_HOST=0.0.0.0
NPC_PORT=8080
NPC_BASE_MODEL=openai
NPC_MEMORY_MODEL=openai
NPC_MAX_MEMORIES=100
NPC_MEMORY_PRUNE_DAYS=90
NPC_PERSONALITY=warm,curious,playful,slightly-sarcastic
NPC_LANGUAGE=en
NPC_LOG_LEVEL=INFO
NPC_COMPUTER_MCP_URL=https://computer-mcp.pollinations.ai
NPC_COMPUTER_MCP_HEADER=x-pollinations-user-id
NPC_AGENT_NAME=npc-memory-agent
NPC_AGENT_TITLE=My NPC Friend
NPC_AGENT_DESCRIPTION=A friendly companion who remembers you across conversations
NPC_CORS_ORIGINS=https://myapp.example.com
NPC_RATE_LIMIT=100/minute
```

## Reward

- **15 Pollen** for the clearest, smallest working solution

## License

MIT
