# Pollinations NPC dialogue for Roblox

[![Made with pollinations.ai](https://raw.githubusercontent.com/pollinations/pollinations/main/packages/ui/src/brand/badge-made-with.svg)](https://pollinations.ai/?ref=badge)

Give an NPC a persona and it answers players in chat, using any
[Pollinations text model](https://gen.pollinations.ai/text/models). The API
key stays in Roblox's [secrets store](https://create.roblox.com/docs/cloud-services/secrets)
and is only used from server scripts.

```luau
local PollinationsNPC = require(game:GetService("ServerScriptService").PollinationsNPC)

PollinationsNPC.attach(workspace.Tomo, {
	name = "Tomo",
	persona = "You keep the old lighthouse on Pollen Island and love bad sea puns.",
})
```

Players who chat within 15 studs of `Tomo` get an in-character reply. It shows
as a chat bubble over the NPC and as a `[Tomo]: ...` line in the chat window.

## Install

1. **Create an API key** at [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys).
   Players in a public game spend this key's Pollen, so give it a budget and
   limit it to the model you use. With the [CLI](https://www.npmjs.com/package/@pollinations/cli):
   `polli keys create --name roblox-npc --models amazon/nova-micro-v1 --budget 1`.
2. **Store it as a secret** named `POLLINATIONS_API_KEY`: Creator Dashboard >
   your experience > Secrets > Create Secret, with the domain
   `gen.pollinations.ai`. Studio playtests can't read those, so for local
   testing add the same secret under File > Experience Settings > Security >
   Local Secrets.
3. **Allow HTTP requests**: File > Experience Settings > Security > Allow HTTP Requests.
4. **Add the scripts**:
   - [`src/PollinationsNPC.luau`](src/PollinationsNPC.luau) as a `ModuleScript`
     named `PollinationsNPC` in `ServerScriptService`.
   - [`src/PollinationsNPCChat.client.luau`](src/PollinationsNPCChat.client.luau)
     as a `LocalScript` in `StarterPlayer > StarterPlayerScripts`. Roblox
     only lets the client draw chat bubbles and chat-window lines.
   - A `Script` in `ServerScriptService` that calls `PollinationsNPC.attach`,
     like [`example/Tomo.server.luau`](example/Tomo.server.luau).

The NPC can be any `Model` with a `PrimaryPart`, a `Head` or another part to
speak from.

## Example place

[`example/place.project.json`](example/place.project.json) builds Pollen
Island: a baseplate, a spawn and Tomo the lighthouse keeper, with HTTP
requests already allowed. Build it with [Rojo](https://rojo.space) 7:

```sh
rojo build example/place.project.json -o PollenIsland.rbxlx
```

Open `PollenIsland.rbxlx` in Studio, add the local secret from step 2, press
Play, walk up to Tomo and say hi.

Without Rojo: start from the Baseplate template, add a rig with Avatar > Rig
Builder, rename it `Tomo`, then follow the install steps.

## Options

`attach(model, options)` and `new(options)` take:

| Option | Default | |
| --- | --- | --- |
| `name` | required | NPC name, used in the prompt and the chat line |
| `persona` | required | Who the NPC is; added to the system prompt |
| `model` | `amazon/nova-micro-v1` | Any id from [/text/models](https://gen.pollinations.ai/text/models) |
| `secretName` | `POLLINATIONS_API_KEY` | Secrets store entry holding the key |
| `maxTurns` | `6` | Exchanges remembered per player |
| `maxTokens` | `150` | Reply length cap |
| `range` | `15` | `attach` only: studs within which players are answered |
| `fallback` | `Hmm, give me a moment to think...` | `attach` only: line shown when a request fails |

For your own trigger (a `ProximityPrompt`, a quest UI, a `/talk` command),
skip `attach` and call the NPC directly from a server script:

```luau
local npc = PollinationsNPC.new({ name = "Tomo", persona = "..." })
local reply, err = npc.reply(player, "Where is the bee meadow?") -- yields
npc.forget(player) -- clear that player's history
```

`reply` returns the reply text, already run through Roblox's text filter, or
`nil` plus an error message. Each player gets their own conversation, and
messages a player sends while their last one is still being answered are
dropped. Failures never throw. `attach` logs them with `warn` (wrong key, no
Pollen, model not allowed for the key, rate limit, HTTP off, missing secret)
and the NPC says its fallback line.

## Tests

[`tests/run.luau`](tests/run.luau) runs the module under [Lune](https://lune-org.github.io/docs)
with stand-ins for the Roblox services. It checks the request, per-player
history and trimming, the text filter, error handling and the `attach` chat
wiring. With a key set, it also makes two real calls to the default model
(checking that the second reply uses the first turn) and one with a wrong key:

```sh
lune run tests/run.luau
POLLINATIONS_API_KEY=sk_... lune run tests/run.luau
```
