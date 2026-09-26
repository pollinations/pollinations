# Pollinations Roblox SDK

A tiny Lua module that lets any Roblox NPC talk to players using the Pollinations text API — no backend server, no npm, just paste one ModuleScript into Studio.

**Who it's for:** Roblox creators (including teenagers with no credit card) who want an AI NPC that can hold a conversation in a few lines of code.

## Install

1. In Roblox Studio, add a `ModuleScript` under `ServerScriptService` (server-side only — never put your API key in a `LocalScript`).
2. Name it `PollinationsNPC` and paste in the contents of [`PollinationsNPC.lua`](./PollinationsNPC.lua).
3. In **Game Settings → Security**, enable **Allow HTTP Requests**.
4. Get a free API key at [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys) — no credit card needed.

## Usage

```lua
local PollinationsNPC = require(game.ServerScriptService.PollinationsNPC)

local npc = PollinationsNPC.new({
	apiKey = "YOUR_KEY",
	persona = "You are a friendly shopkeeper.",
})

local reply = npc:Say("Hi there!")
print(reply)
```

See [`example/TalkingNPC.server.lua`](./example/TalkingNPC.server.lua) for a full ProximityPrompt-based NPC.

## API

### `PollinationsNPC.new(config)`

| Field | Type | Default | Description |
|---|---|---|---|
| `apiKey` | string | `nil` | Your Pollinations API key (`pk_...`) |
| `model` | string | `"openai"` | Any model from [gen.pollinations.ai/v1/models](https://gen.pollinations.ai/v1/models) |
| `persona` | string | `"You are a friendly NPC in a video game."` | System prompt defining the NPC's personality |
| `maxHistory` | number | `10` | Messages kept in conversation before trimming |
| `fallbackReply` | string | `"Hmm, I didn't catch that. Try again?"` | Returned if the request fails |

### `npc:Say(playerMessage)`
Sends the player's message plus conversation history to Pollinations and returns the NPC's reply as a string.

## Notes
- Keep this module server-side so your API key is never exposed to clients.
- Full text API reference: [`../../APIDOCS.md`](../../APIDOCS.md)