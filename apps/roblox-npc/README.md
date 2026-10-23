# Pollinations NPC for Roblox

[![Made with pollinations.ai](https://raw.githubusercontent.com/pollinations/pollinations/main/packages/ui/src/brand/badge-made-with.svg)](https://pollinations.ai/?ref=badge)

Give an NPC a persona and a conversation with each player, powered by
[Pollinations](https://gen.pollinations.ai) text models: a small Luau module, no
backend server. You decide when the NPC talks; it returns the reply.

```luau
local PollinationsNPC = require(game:GetService("ServerScriptService").PollinationsNPC)

local npc = PollinationsNPC.new({ persona = "You are a friendly shopkeeper." })

local reply = npc:Say(player, "Hi there!") -- yields
```

The example place has Grix, a grumpy blacksmith. The Talk prompt makes him
greet you, and anything you type in chat within 15 studs gets an answer as a
chat bubble over his head.

## Play the example

[`GrixForge.rbxlx`](GrixForge.rbxlx) is a small place with Grix next to the
spawn. HTTP requests are already allowed.

1. Create an API key at [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys).
2. Open `GrixForge.rbxlx` in Roblox Studio.
3. Under File > Experience Settings > Security > Local Secrets, add a secret
   named `POLLINATIONS_API_KEY` with your key and the domain
   `gen.pollinations.ai`.
4. Press Play, walk up to Grix and press E, or just type to him.

## Add it to your game

1. Add [`src/PollinationsNPC.luau`](src/PollinationsNPC.luau) as a ModuleScript
   named `PollinationsNPC` in ServerScriptService.
2. Add a Script next to it that creates the NPC and decides when it talks, like
   [`src/server/TalkingNPC.server.luau`](src/server/TalkingNPC.server.luau)
   (a ProximityPrompt plus nearby chat; it uses a part named `Grix`).
3. Add [`src/client/NPCChatBubble.client.luau`](src/client/NPCChatBubble.client.luau)
   as a LocalScript in StarterPlayer > StarterPlayerScripts, so replies show
   as chat bubbles. Roblox only lets the client draw them.
4. File > Experience Settings > Security > Allow HTTP Requests.
5. Add your key to the game's secrets store (Creator Dashboard > your
   experience > Secrets) as `POLLINATIONS_API_KEY` with the domain
   `gen.pollinations.ai`, and to Local Secrets for Studio playtests. Players
   spend this key's Pollen, so give it a budget on
   [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys).

With [Rojo](https://rojo.space) 7, `rojo build -o GrixForge.rbxlx` rebuilds the
example place from [`default.project.json`](default.project.json).

## API

### `PollinationsNPC.new(config)`

| Field | Default | |
| --- | --- | --- |
| `persona` | `"You are a friendly NPC in a video game."` | System prompt defining the NPC |
| `model` | `amazon/nova-micro-v1` | Any model from [/text/models](https://gen.pollinations.ai/text/models) |
| `secretName` | `POLLINATIONS_API_KEY` | Secret holding your API key |
| `maxHistory` | `10` | Messages remembered per player |
| `fallbackReply` | `"Hmm, I didn't catch that. Try again?"` | Said when a request fails; the reason goes to the output with `warn` |

### `npc:Say(player, message)`

Sends the message plus that player's conversation to Pollinations and returns
the NPC's reply, run through Roblox's text filter so it can be shown to
everyone. Returns `nil` while the player is still waiting for the previous
reply. Call it from a server Script; it yields.

## Credits

- [tomdacatto](https://github.com/tomdacatto) built this module, Grix and the
  bubble client ([#15669](https://github.com/pollinations/pollinations/issues/15669)),
  referencing [@mohityadav8](https://github.com/mohityadav8)'s NPC SDK draft
  [#14817](https://github.com/pollinations/pollinations/pull/14817).
- [Drjacky](https://github.com/Drjacky)
  ([#16734](https://github.com/pollinations/pollinations/pull/16734)): per-player
  history, the safety line in the prompt and the Rojo place with HTTP enabled.

Built for quest [#15583](https://github.com/pollinations/pollinations/issues/15583).
