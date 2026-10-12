# Pollen Village: talking NPCs for Roblox

[![Made with pollinations.ai](https://raw.githubusercontent.com/pollinations/pollinations/main/packages/ui/src/brand/badge-made-with.svg)](https://pollinations.ai/?ref=badge)

Give a Roblox NPC a persona and it answers players in chat, using any
[Pollinations text model](https://gen.pollinations.ai/text/models). The API key
stays in Roblox's [secrets store](https://create.roblox.com/docs/cloud-services/secrets)
and is only used by server scripts.

```luau
local PollinationsNpc = require(game:GetService("ServerScriptService").PollinationsNpc)

PollinationsNpc.new(workspace.Sage, {
	name = "Sage",
	persona = "Sage is a retired cartographer who has walked every road in the valley.",
})
```

Players within 20 studs of Sage, or anyone who starts a message with
"Sage," or "@Sage", get an in-character reply. It appears as a chat bubble
over Sage's head and as a `[Sage]` line in the chat window. Each player has
their own conversation, and every reply goes through Roblox's text filter.

## Play the example

[`PollenVillage.rbxlx`](PollenVillage.rbxlx) is a small place with Sage standing
next to the spawn. HTTP requests are already allowed.

1. Create an API key at [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys).
2. Open `PollenVillage.rbxlx` in Roblox Studio.
3. Under File > Experience Settings > Security > Local Secrets, add a secret
   named `POLLINATIONS_API_KEY` with your key and the domain
   `gen.pollinations.ai`.
4. Press Play and say hi to Sage.

## Add it to your game

1. **Key.** Players in a public game spend this key's Pollen, so limit it to
   text models and give it a budget, either on
   [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys) or with the
   [CLI](https://www.npmjs.com/package/@pollinations/cli):
   `polli keys create --name roblox-npc --models text --budget 1`.
2. **Secret.** Creator Dashboard > your experience > Secrets > Create Secret:
   name `POLLINATIONS_API_KEY`, domain `gen.pollinations.ai`. Studio playtests
   can't read these, so also add it under Local Secrets as above.
3. **HTTP.** File > Experience Settings > Security > Allow HTTP Requests.
4. **Scripts.**
   - [`src/PollinationsNpc.luau`](src/PollinationsNpc.luau) as a ModuleScript
     named `PollinationsNpc` in ServerScriptService.
   - [`src/PollinationsNpcChat.client.luau`](src/PollinationsNpcChat.client.luau)
     as a LocalScript in StarterPlayer > StarterPlayerScripts. Roblox only
     lets the client draw chat bubbles and chat lines.
   - A Script in ServerScriptService that calls `PollinationsNpc.new`, like
     [`example/Sage.server.luau`](example/Sage.server.luau).

The NPC can be any Model with a part named `Head` (or any part) to speak from.
With [Rojo](https://rojo.space) 7, `rojo build -o PollenVillage.rbxlx` rebuilds the
example place from [`default.project.json`](default.project.json).

## Options

| Option | Default | |
| --- | --- | --- |
| `name` | required | How players address the NPC; also its chat-line label |
| `persona` | required | Who the NPC is, in a sentence or two |
| `model` | `amazon/nova-micro-v1` | Any id from [/text/models](https://gen.pollinations.ai/text/models) |
| `secretName` | `POLLINATIONS_API_KEY` | Secrets store entry holding the key |
| `talkRadius` | `20` | Studs within which players are answered without the name |
| `maxHistory` | `12` | Messages remembered per player |

`new` returns `ask(player, text)`, which yields and returns the filtered
reply. Use it to answer from your own trigger, such as a ProximityPrompt or
quest UI.

When a request fails, Sage stays in character ("My purse is out of pollen…")
and the real reason (missing secret, HTTP off, wrong key, rate limit) goes to
the server output with `warn`.

## Credits

- [xiaotian1171](https://github.com/xiaotian1171) built Pollen Village and Sage
  ([#15708](https://github.com/pollinations/pollinations/issues/15708)): the
  persona, prompt rules, name addressing, reply cleanup and in-character error lines.
- [Drjacky](https://github.com/Drjacky)
  ([#16734](https://github.com/pollinations/pollinations/pull/16734)): listening
  to chat on the server, per-player history, the bubble plus chat line, the
  Rojo place with HTTP enabled and the key budget advice.
- [Marcus-Mok-GH](https://github.com/Marcus-Mok-GH)
  ([#15629](https://github.com/pollinations/pollinations/issues/15629)) first
  sent replies to a client chat line through a RemoteEvent.

Built for quest [#15583](https://github.com/pollinations/pollinations/issues/15583).
