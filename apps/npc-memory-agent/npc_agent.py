#!/usr/bin/env python3
"""NPC Memory Agent — production-ready persistent NPC companion.

Cross-session NPC that remembers users across conversations using
the Computer MCP for persistent per-user memory storage.

All configuration is via environment variables. See .env.example for
the full list.
"""

import asyncio
import datetime
import json
import logging
import os
import signal
import sys
import uuid
from contextlib import asynccontextmanager
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

# ---------------------------------------------------------------------------
# Configuration (all from env, with sensible defaults)
# ---------------------------------------------------------------------------

def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


def _env_int(key: str, default: int) -> int:
    try:
        return int(os.environ.get(key, str(default)))
    except ValueError:
        return default


def _env_list(key: str, default: list[str]) -> list[str]:
    raw = os.environ.get(key)
    if raw is None:
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


HOST = _env("NPC_HOST", "0.0.0.0")
PORT = _env_int("NPC_PORT", 8080)
BASE_MODEL = _env("NPC_BASE_MODEL", "openai")
MEMORY_MODEL = _env("NPC_MEMORY_MODEL", "openai")
MAX_MEMORIES = _env_int("NPC_MAX_MEMORIES", 100)
MEMORY_PRUNE_DAYS = _env_int("NPC_MEMORY_PRUNE_DAYS", 90)
PERSONALITY_TRAITS = _env_list("NPC_PERSONALITY", ["warm", "curious", "playful"])
DEFAULT_LANGUAGE = _env("NPC_LANGUAGE", "en")
LOG_LEVEL = _env("NPC_LOG_LEVEL", "INFO")
COMPUTER_MCP_URL = _env("NPC_COMPUTER_MCP_URL", "http://localhost:8787")
COMPUTER_MCP_HEADER = _env("NPC_COMPUTER_MCP_HEADER", "x-pollinations-user-id")
AGENT_NAME = _env("NPC_AGENT_NAME", "npc-memory-agent")
AGENT_TITLE = _env("NPC_AGENT_TITLE", "NPC Memory Agent")
AGENT_DESCRIPTION = _env(
    "NPC_AGENT_DESCRIPTION",
    "A friendly NPC companion who remembers you across conversations.",
)
CORS_ORIGINS = _env_list("NPC_CORS_ORIGINS", ["*"])
RATE_LIMIT = _env("NPC_RATE_LIMIT", "60/minute")
POLLINATIONS_API_BASE = _env("NPC_POLLINATIONS_API_BASE", "https://gen.pollinations.ai/v1")
POLLINATIONS_API_KEY = _env("NPC_POLLINATIONS_API_KEY", "")
CHAT_ENDPOINT = _env("NPC_CHAT_ENDPOINT", "/chat/completions")
EMBEDDINGS_ENDPOINT = _env("NPC_EMBEDDINGS_ENDPOINT", "/embeddings")

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(AGENT_NAME)

# ---------------------------------------------------------------------------
# HTTP client singleton
# ---------------------------------------------------------------------------

_http_client: httpx.AsyncClient | None = None


async def get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(
            timeout=30.0,
            limits=httpx.Limits(max_connections=50, max_keepalive_connections=10),
        )
    return _http_client


async def close_http_client():
    global _http_client
    if _http_client:
        await _http_client.aclose()
        _http_client = None


# ---------------------------------------------------------------------------
# Computer MCP client
# ---------------------------------------------------------------------------


async def mcp_call(user_id: str, command: str, stdin: str = "") -> str:
    """Call the Computer MCP bash tool for a given user."""
    client = await get_http_client()
    headers = {
        "content-type": "application/json",
        "accept": "application/json, text/event-stream",
        COMPUTER_MCP_HEADER: user_id,
    }
    payload = {
        "jsonrpc": "2.0",
        "id": str(uuid.uuid4()),
        "method": "tools/call",
        "params": {"name": "bash", "arguments": {"command": command}},
    }
    if stdin:
        payload["params"]["arguments"]["stdin"] = stdin

    resp = await client.post(COMPUTER_MCP_URL, headers=headers, json=payload)
    resp.raise_for_status()

    # Parse SSE or JSON response
    text = resp.text
    if text.startswith("data:"):
        # SSE format — take last data line
        for line in text.strip().split("\n"):
            if line.startswith("data:"):
                data = line[5:].strip()
                if data:
                    try:
                        parsed = json.loads(data)
                        result = parsed.get("result", {})
                        content = result.get("content", [])
                        if content and content[0].get("type") == "text":
                            return content[0].get("text", "")
                    except (json.JSONDecodeError, KeyError, IndexError):
                        pass
        return ""
    else:
        try:
            parsed = resp.json()
            result = parsed.get("result", {})
            content = result.get("content", [])
            if content and content[0].get("type") == "text":
                return content[0].get("text", "")
        except (json.JSONDecodeError, KeyError, IndexError):
            return ""
    return ""


async def mcp_write_file(user_id: str, path: str, content: str) -> str:
    """Write content to a file via Computer MCP (cat > path)."""
    return await mcp_call(user_id, f"cat > {path}", stdin=content)


async def mcp_read_file(user_id: str, path: str) -> str:
    """Read a file via Computer MCP (cat path)."""
    return await mcp_call(user_id, f"cat {path}")


async def mcp_append_file(user_id: str, path: str, content: str) -> str:
    """Append content to a file via Computer MCP (cat >> path)."""
    return await mcp_call(user_id, f"cat >> {path}", stdin=content)


async def mcp_file_exists(user_id: str, path: str) -> bool:
    """Check if a file exists via Computer MCP."""
    result = await mcp_call(user_id, f"test -f {path} && echo yes || echo no")
    return result.strip() == "yes"


# ---------------------------------------------------------------------------
# LLM client
# ---------------------------------------------------------------------------


def _llm_headers() -> dict[str, str]:
    headers = {"content-type": "application/json"}
    if POLLINATIONS_API_KEY:
        headers["authorization"] = f"Bearer {POLLINATIONS_API_KEY}"
    return headers


async def llm_chat(
    messages: list[dict[str, str]],
    model: str | None = None,
    temperature: float = 0.7,
) -> str:
    """Send a chat completion request to the LLM."""
    client = await get_http_client()
    payload = {
        "model": model or BASE_MODEL,
        "messages": messages,
        "temperature": temperature,
    }
    resp = await client.post(
        f"{POLLINATIONS_API_BASE}{CHAT_ENDPOINT}",
        headers=_llm_headers(),
        json=payload,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"]


# ---------------------------------------------------------------------------
# Memory Engine
# ---------------------------------------------------------------------------

FACTS_PATH = "/workspace/memory/facts.md"
JOURNAL_DIR = "/workspace/memory/log"


def _today() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


async def _ensure_memory_dir(user_id: str) -> None:
    """Ensure the memory directory structure exists."""
    await mcp_call(user_id, "mkdir -p /workspace/memory/log")


FACTS_TEMPLATE = """# User Memory: {user_id}

## Identity
- Name: {{name}}
- First seen: {first_seen}
- Last interaction: {last_interaction}

## Preferences
{{preferences}}

## Context
- Projects: {{projects}}
- Interests: {{interests}}

## Notes
{{notes}}
"""


async def load_facts(user_id: str) -> dict[str, Any]:
    """Load and parse the facts file for a user."""
    if not await mcp_file_exists(user_id, FACTS_PATH):
        return {}

    raw = await mcp_read_file(user_id, FACTS_PATH)
    if not raw.strip():
        return {}

    facts: dict[str, Any] = {"raw": raw, "structured": {}}
    current_section = None

    for line in raw.split("\n"):
        line = line.strip()
        if line.startswith("#") and not line.startswith("##"):
            # Title line — extract user_id if present
            continue
        if line.startswith("## "):
            current_section = line[3:].strip()
            facts["structured"][current_section] = {}
        elif line.startswith("- ") and current_section:
            # Parse bullet: "Key: Value" or just "Value"
            item = line[2:]
            if ":" in item:
                key, _, value = item.partition(":")
                facts["structured"][current_section][key.strip()] = value.strip()
            else:
                # List item without key
                if "_list" not in facts["structured"][current_section]:
                    facts["structured"][current_section]["_list"] = []
                facts["structured"][current_section]["_list"].append(item)

    return facts


async def save_facts(user_id: str, facts: dict[str, Any]) -> None:
    """Save the facts dictionary back to the facts file."""
    await _ensure_memory_dir(user_id)
    structured = facts.get("structured", {})

    lines = [
        f"# User Memory: {user_id}",
        "",
    ]

    for section, data in structured.items():
        lines.append(f"## {section}")
        if isinstance(data, dict):
            for key, value in data.items():
                if key == "_list":
                    for item in value:
                        lines.append(f"- {item}")
                else:
                    lines.append(f"- {key}: {value}")
        lines.append("")

    content = "\n".join(lines)
    await mcp_write_file(user_id, FACTS_PATH, content)


async def append_journal(user_id: str, entry: str) -> None:
    """Append an entry to today's journal."""
    await _ensure_memory_dir(user_id)
    today = _today()
    timestamp = _now()
    journal_path = f"{JOURNAL_DIR}/{today}.md"
    await mcp_append_file(user_id, journal_path, f"\n## {timestamp}\n{entry}\n")


async def extract_facts(user_id: str, message: str) -> list[dict[str, str]]:
    """Use LLM to extract structured facts from a user message."""
    prompt = f"""Extract structured facts from this user message. Return ONLY a JSON array of objects with "key", "value", and "action" (created/updated/deleted). If no facts found, return [].

Message: "{message}"

Valid keys: name, pronouns, language, likes, dislikes, projects, interests, occupation, people, pets, notes.

Output format: [{{"key": "...", "value": "...", "action": "..."}}]"""

    try:
        response = await llm_chat(
            [{"role": "user", "content": prompt}],
            model=MEMORY_MODEL,
            temperature=0.1,
        )
        # Find JSON array in response
        start = response.index("[")
        end = response.rindex("]") + 1
        facts = json.loads(response[start:end])
        return facts if isinstance(facts, list) else []
    except (json.JSONDecodeError, ValueError) as e:
        logger.warning("Failed to extract facts from %r: %s", message, e)
        return []


async def apply_facts(user_id: str, facts: list[dict[str, str]]) -> list[dict[str, str]]:
    """Apply extracted facts to the user's memory. Returns list of applied changes."""
    if not facts:
        return []

    current = await load_facts(user_id)
    if not current:
        # First conversation — initialize
        current = {
            "raw": "",
            "structured": {
                "Identity": {
                    "Name": "{{pending}}",
                    "First seen": _now(),
                    "Last interaction": _now(),
                },
                "Preferences": {},
                "Context": {
                    "Projects": "{{none}}",
                    "Interests": "{{none}}",
                },
                "Notes": {},
            },
        }

    applied = []
    identity = current["structured"].setdefault("Identity", {})
    identity["Last interaction"] = _now()

    for fact in facts:
        key = fact.get("key", "").strip()
        value = fact.get("value", "").strip()
        action = fact.get("action", "created")
        if not key or not value:
            continue

        # Map to sections
        section_map = {
            "name": ("Identity", "Name"),
            "pronouns": ("Identity", "Pronouns"),
            "language": ("Identity", "Language"),
            "likes": ("Preferences", "Likes"),
            "dislikes": ("Preferences", "Dislikes"),
            "projects": ("Context", "Projects"),
            "interests": ("Context", "Interests"),
            "occupation": ("Context", "Occupation"),
            "people": ("Relationships", "People"),
            "pets": ("Relationships", "Pets"),
            "notes": ("Notes", "_list"),
        }

        section, field = section_map.get(key.lower(), ("Notes", key))
        sec = current["structured"].setdefault(section, {})

        if field == "_list":
            if "_list" not in sec:
                sec["_list"] = []
            if action == "deleted":
                sec["_list"] = [i for i in sec["_list"] if i != value]
            else:
                old = sec["_list"].copy()
                sec["_list"].append(value)
                if old:
                    action = "updated"
        else:
            old_value = sec.get(field, "")
            sec[field] = value
            if old_value and old_value != value:
                action = "updated"

        applied.append({"key": key, "value": value, "action": action})

    # Enforce max memories
    total = sum(
        len(v) if isinstance(v, dict) else 0
        for v in current["structured"].values()
    )
    if total > MAX_MEMORIES:
        # Prune oldest notes
        notes = current["structured"].get("Notes", {})
        if "_list" in notes and len(notes["_list"]) > 0:
            notes["_list"] = notes["_list"][-MAX_MEMORIES:]
            applied.append({"key": "pruned", "value": f"exceeded {MAX_MEMORIES} memories", "action": "auto"})

    await save_facts(user_id, current)

    # Log significant changes
    if applied:
        change_desc = "; ".join(f"{a['action']}: {a['key']}={a['value']}" for a in applied)
        await append_journal(user_id, f"- Extracted facts: {change_desc}")

    return applied


async def get_memories(user_id: str) -> dict[str, Any]:
    """Get all memories for a user (for display)."""
    facts = await load_facts(user_id)
    if not facts:
        return {"user_id": user_id, "memories": {}, "exists": False}
    return {
        "user_id": user_id,
        "memories": facts.get("structured", {}),
        "exists": True,
    }


async def forget_memory(user_id: str, key: str) -> dict[str, Any]:
    """Remove a specific memory by key. Returns what was removed."""
    facts = await load_facts(user_id)
    if not facts:
        return {"removed": None, "message": "No memories found"}

    structured = facts.get("structured", {})
    removed = None

    for section, data in structured.items():
        if isinstance(data, dict):
            # Check direct fields
            if key in data:
                removed = {"section": section, "key": key, "value": data.pop(key)}
                break
            # Check list fields
            for field, value in data.items():
                if isinstance(value, list):
                    for item in value:
                        if key.lower() in item.lower():
                            value.remove(item)
                            removed = {"section": section, "key": key, "value": item}
                            break

    if removed:
        await save_facts(user_id, facts)
        await append_journal(user_id, f"- Forgot: {key}")

    return {"removed": removed, "message": f"Forgot: {key}" if removed else f"No memory found for: {key}"}


# ---------------------------------------------------------------------------
# NPC Personality & Response Generation
# ---------------------------------------------------------------------------


def _system_prompt(user_id: str, facts: dict[str, Any]) -> str:
    """Build the system prompt with personality and memory context."""
    personality_str = ", ".join(PERSONALITY_TRAITS)

    memory_section = ""
    if facts:
        memory_section = (
            "## What You Remember\n"
            f"{json.dumps(facts.get('structured', {}), indent=2)}\n\n"
        )
        # Add a greeting hint
        name = (
            facts.get("structured", {})
            .get("Identity", {})
            .get("Name", "")
        )
        if name and name != "{{pending}}" and name != "{{none}}":
            memory_section += f"Greet the user by name ({name}). Reference something specific you remember.\n\n"

    return f"""You are {AGENT_TITLE}. {AGENT_DESCRIPTION}

Personality: {personality_str}
Language: {DEFAULT_LANGUAGE}

{memory_section}## Rules

- If this is your first conversation (no facts), ask the user's name warmly
- If you know the user, greet them by name and reference something you remember
- Be specific when referencing memories ("How's the hiking app?" not "How's your project?")
- When the user shares a personal fact, say "I'll remember that!" or similar
- When the user asks "what do you remember?" or "show my memories", summarize your stored facts clearly
- When the user asks to forget something, acknowledge and confirm deletion
- If the user shares a conflicting preference, note the update
- Keep responses warm and concise (2-4 sentences normally)
- Use occasional emojis (max 2 per response)
- Match the user's language style

## Tool Use

You can use the Computer MCP filesystem:
- Read /workspace/memory/facts.md to see stored memories
- Write/update facts.md when you learn new facts
- Append to /workspace/memory/log/ for significant events

## Response Style

Your response will be sent directly to the user. Be natural, warm, and helpful."""


async def generate_response(user_id: str, message: str) -> dict[str, Any]:
    """Generate an NPC response, extracting and applying facts."""
    # Load existing facts
    facts = await load_facts(user_id)

    # Extract facts from the new message
    extracted = await extract_facts(user_id, message)

    # Apply extracted facts to memory
    applied = await apply_facts(user_id, extracted)

    # Re-load facts (may have been updated)
    updated_facts = await load_facts(user_id)

    # Build system prompt with updated memory
    system = _system_prompt(user_id, updated_facts)

    # Generate response
    response = await llm_chat(
        [
            {"role": "system", "content": system},
            {"role": "user", "content": message},
        ]
    )

    return {
        "user_id": user_id,
        "response": response,
        "memories_extracted": applied,
    }


# ---------------------------------------------------------------------------
# Web UI
# ---------------------------------------------------------------------------

WEB_UI_HTML = """<!DOCTYPE html>
<html lang="{{language}}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{title}}</title>
    <style>
        :root {
            --bg: {{bg_color}};
            --fg: {{fg_color}};
            --accent: {{accent_color}};
            --muted: {{muted_color}};
            --bubble-bg: {{bubble_bg}};
            --bubble-fg: {{bubble_fg}};
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg);
            color: var(--fg);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        header {
            padding: 1rem;
            border-bottom: 1px solid var(--muted);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        header h1 { font-size: 1.2rem; color: var(--accent); }
        .controls { display: flex; gap: 0.5rem; align-items: center; }
        .controls input {
            padding: 0.4rem 0.6rem;
            border-radius: 0.3rem;
            border: 1px solid var(--muted);
            background: var(--bubble-bg);
            color: var(--fg);
            font-size: 0.85rem;
        }
        .controls button {
            padding: 0.4rem 0.8rem;
            border: none;
            border-radius: 0.3rem;
            background: var(--accent);
            color: var(--bg);
            cursor: pointer;
            font-size: 0.85rem;
        }
        .messages {
            flex: 1;
            overflow-y: auto;
            padding: 1rem;
            display: flex;
            flex-direction: column;
            gap: 0.8rem;
        }
        .message {
            max-width: 80%;
            padding: 0.6rem 1rem;
            border-radius: 0.8rem;
            line-height: 1.4;
        }
        .message.user {
            align-self: flex-end;
            background: var(--accent);
            color: var(--bg);
        }
        .message.npc {
            align-self: flex-start;
            background: var(--bubble-bg);
            color: var(--bubble-fg);
        }
        .input-area {
            padding: 1rem;
            border-top: 1px solid var(--muted);
            display: flex;
            gap: 0.5rem;
        }
        .input-area input {
            flex: 1;
            padding: 0.7rem 1rem;
            border-radius: 1.5rem;
            border: 1px solid var(--muted);
            background: var(--bubble-bg);
            color: var(--fg);
            font-size: 1rem;
            outline: none;
        }
        .input-area input:focus { border-color: var(--accent); }
        .input-area button {
            padding: 0.7rem 1.5rem;
            border: none;
            border-radius: 1.5rem;
            background: var(--accent);
            color: var(--bg);
            cursor: pointer;
            font-weight: bold;
        }
        .status {
            font-size: 0.75rem;
            color: var(--muted);
            padding: 0 1rem;
        }
    </style>
</head>
<body>
    <header>
        <h1>{{title}}</h1>
        <div class="controls">
            <input type="text" id="userId" placeholder="User ID" value="default" />
            <button onclick="showMemories()">Memories</button>
            <button onclick="clearChat()">Clear</button>
        </div>
    </header>
    <div class="messages" id="messages"></div>
    <div class="status" id="status">Ready</div>
    <div class="input-area">
        <input type="text" id="message" placeholder="Type a message..." onkeydown="if(event.key==='Enter')send()" />
        <button onclick="send()">Send</button>
    </div>
    <script>
        const messagesDiv = document.getElementById('messages');
        const messageInput = document.getElementById('message');
        const userIdInput = document.getElementById('userId');
        const statusDiv = document.getElementById('status');

        function addMessage(role, text) {
            const div = document.createElement('div');
            div.className = 'message ' + role;
            div.textContent = text;
            messagesDiv.appendChild(div);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }

        function clearChat() {
            messagesDiv.innerHTML = '';
            statusDiv.textContent = 'Chat cleared';
        }

        async function send() {
            const text = messageInput.value.trim();
            if (!text) return;
            const userId = userIdInput.value.trim() || 'default';
            addMessage('user', text);
            messageInput.value = '';
            statusDiv.textContent = 'Thinking...';

            try {
                const resp = await fetch('/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: userId, message: text })
                });
                const data = await resp.json();
                addMessage('npc', data.response);
                if (data.memories_extracted && data.memories_extracted.length > 0) {
                    statusDiv.textContent = 'Memories: ' + data.memories_extracted.map(m => m.key + '=' + m.value).join(', ');
                } else {
                    statusDiv.textContent = 'Ready';
                }
            } catch (e) {
                addMessage('npc', 'Sorry, something went wrong. Please try again.');
                statusDiv.textContent = 'Error: ' + e.message;
            }
        }

        async function showMemories() {
            const userId = userIdInput.value.trim() || 'default';
            try {
                const resp = await fetch('/memory/' + encodeURIComponent(userId));
                const data = await resp.json();
                if (data.exists) {
                    addMessage('npc', 'Here is what I remember:\\n' + JSON.stringify(data.memories, null, 2));
                } else {
                    addMessage('npc', 'I have no memories for this user yet.');
                }
            } catch (e) {
                addMessage('npc', 'Could not load memories: ' + e.message);
            }
        }
    </script>
</body>
</html>
"""


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    logger.info(
        "Starting %s on %s:%s (model=%s, mcp=%s)",
        AGENT_NAME, HOST, PORT, BASE_MODEL, COMPUTER_MCP_URL,
    )
    yield
    logger.info("Shutting down %s...", AGENT_NAME)
    await close_http_client()


app = FastAPI(
    title=AGENT_TITLE,
    description=AGENT_DESCRIPTION,
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    return {"status": "ok", "agent": AGENT_NAME, "timestamp": _now()}


@app.get("/", response_class=HTMLResponse)
async def web_ui():
    """Serve the chat interface."""
    return WEB_UI_HTML.replace("{{title}}", AGENT_TITLE).replace(
        "{{language}}", DEFAULT_LANGUAGE
    ).replace("{{bg_color}}", _env("NPC_UI_BG", "#1a1a2e")).replace(
        "{{fg_color}}", _env("NPC_UI_FG", "#eaeaea")
    ).replace("{{accent_color}}", _env("NPC_UI_ACCENT", "#e94560")).replace(
        "{{muted_color}}", _env("NPC_UI_MUTED", "#4a4a6a")
    ).replace("{{bubble_bg}}", _env("NPC_UI_BUBBLE_BG", "#16213e")).replace(
        "{{bubble_fg}}", _env("NPC_UI_BUBBLE_FG", "#eaeaea")
    )


@app.post("/chat")
async def chat(payload: dict[str, str]):
    """Chat endpoint — send a message, get NPC response."""
    user_id = payload.get("user_id", "").strip()
    message = payload.get("message", "").strip()

    if not user_id:
        raise HTTPException(400, "user_id is required")
    if not message:
        raise HTTPException(400, "message is required")

    result = await generate_response(user_id, message)
    return JSONResponse(result)


@app.get("/memory/{user_id}")
async def get_memory(user_id: str):
    """Get all memories for a user."""
    return JSONResponse(await get_memories(user_id))


@app.delete("/memory/{user_id}/{key}")
async def delete_memory(user_id: str, key: str):
    """Forget a specific memory."""
    return JSONResponse(await forget_memory(user_id, key))


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    logger.info("Starting %s v1.0.0", AGENT_NAME)
    uvicorn.run(app, host=HOST, port=PORT)
