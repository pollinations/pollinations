# Pollinations Roblox NPC

[![Quest](https://img.shields.io/badge/Quest-%2315583%20(FIXED)-blue)](https://github.com/pollinations/pollinations/issues/15583)
[![Roblox](https://img.shields.io/badge/Roblox-Luau-00ff00)](https://create.roblox.com/)

Luau module that gives your NPCs conversations powered by Pollinations AI text models. Players type in chat, NPCs reply with AI-generated dialogue in-character.

## Features

- **Async text generation** via `gen.pollinations.ai/v1/chat/completions` (Bearer) or `text.pollinations.ai/{prompt}` (key=)
- **Persona system** — set a system prompt, NPCs stay in character
- **Multiple model support** — any text model from `gen.pollinations.ai/text/models`
- **Secret-based auth** — uses Roblox's `ServerStorage:GetSecret()` for API keys
- **Fallback auth** — works without a key via `?key=` query parameter
- **Example NPC script** — drop-in demo with chat handler

## Installation

### 1. Import the module

1. Download this repository
2. In Roblox Studio, open **View → Explorer**
3. Copy `src/PollinationsNPC.lua` to `ServerScriptService → Modules → PollinationsNPC`

### 2. Set up your API key (recommended)

In **Creator Dashboard → Games → Your Game → Configure Game → Secrets**:
1. Add a new secret: `Key Name = POLLINATIONS_API_KEY`, `Value = sk_...`
2. In your script: `game:GetService("ServerStorage"):GetSecret("POLLINATIONS_API_KEY")`

### 3. Add the example NPC

1. Copy `src/ExampleNPCScript.lua` to `ServerScriptService`
2. The example NPC uses a wizard persona

### 4. Enable HTTP Service

1. In Roblox Studio: **Home → Game Settings → Security**
2. Enable **Enable Studio Access to API Services** (for testing)
3. On publish: enable **HTTP Requests** in game config

## Quick Start

```lua
local PollinationsNPC = require(game.ServerScriptService.Modules.PollinationsNPC)

local npc = PollinationsNPC.new({
    model = "openai/gpt-5.4-nano",
    systemPrompt = "You are a pirate captain who speaks in pirate slang.",
    apiKey = game:GetService("ServerStorage"):GetSecret("POLLINATIONS_API_KEY") or "",
    temperature = 0.8,
})

print(npc:GetGreeting())  -- "Hello, traveler!"
local reply = npc:AskPlayer("Where is the treasure?")
print(reply)
```

## API Reference

| Method | Description |
|---|---|
| `PollinationsNPC.new(config)` | Create a new NPC instance |
| `npc:GenerateText(prompt, model?)` | Generate text from prompt |
| `npc:AskPlayer(question)` | Ask NPC a question, get persona reply |
| `npc:GetGreeting()` | Get a random NPC greeting |
| `npc:SetPersona(prompt)` | Change the NPC's system prompt |
| `npc:GetTextModels()` | Fetch available text models |

## Config fields

| Field | Default | Description |
|---|---|---|
| `model` | `openai/gpt-5.4-nano` | Pollinations text model |
| `systemPrompt` | `"You are a helpful NPC..."` | NPC persona |
| `temperature` | `0.7` | Creativity (0.0–1.0) |
| `maxTokens` | `256` | Max response length |
| `apiKey` | `""` | API key (from Secrets or direct) |

## Demo

Drop `ExampleNPCScript.lua` into `ServerScriptService` to spawn a wizard NPC. Players can type in chat and the NPC responds with AI-generated dialogue.

## License

MIT — see [CHANGELOG.md](CHANGELOG.md).

## Quest

This module fulfills [Quest #15583](https://github.com/pollinations/pollinations/issues/15583) — _[QUEST] Pollinations NPC dialogue for Roblox_
