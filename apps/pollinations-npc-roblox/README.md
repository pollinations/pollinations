# Pollinations NPC Dialogue for Roblox

Give Roblox NPCs real conversations powered by [Pollinations](https://gen.pollinations.ai/docs)
text models — in a few lines of Luau.

- **`luau/PollinationsNPC.luau`** — a single-file ModuleScript. Give an NPC a
  persona and let it reply to players in chat. The module calls
  `POST https://gen.pollinations.ai/v1/chat/completions` through Roblox
  `HttpService`, keeps a short per-player conversation history, and never
  blocks or crashes the server on network errors.
- **`luau/TalkingNPC.server.luau`** — example server script wiring the module
  to one talking NPC ("Bramble") in an example Place.
- **`luau/ExamplePlace.md`** — step-by-step instructions to build and publish
  the playable example place.
- **API key** — kept in [Roblox's Cloud Secrets store](https://create.roblox.com/docs/cloud-services/secrets)
  and read only from server scripts via `HttpService:GetSecret` — the key
  never touches the client.

Any text model from the [live model list](https://gen.pollinations.ai/text/models)
can be used (default: `openai/gpt-5.4-nano`).

## How it works

```
Player chats "@Bramble hello"
   -> TalkingNPC.server.luau picks up the message
   -> PollinationsNPC:Respond(player, message)
      -> HttpService:GetSecret("POLLINATIONS_API_KEY")
      -> POST gen.pollinations.ai/v1/chat/completions  (Authorization: Bearer <secret>)
      -> NPC's reply appears in chat + in a speech bubble above her head
```

## Install steps (Roblox developer)

### 1. Get a Pollinations API key

1. Sign in at [enter.pollinations.ai](https://enter.pollinations.ai) (top up
   Pollen if needed).
2. Create an API key at [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys)
   (`sk_*` secret key — server-side use).
3. Copy the key. It will live in Roblox's Secrets store — never in your source
   code.

### 2. Add the module to your experience

1. In Roblox Studio, open your experience.
2. Under **ServerScriptService**, create a `ModuleScript` named
   `PollinationsNPC` and paste the contents of
   [`luau/PollinationsNPC.luau`](luau/PollinationsNPC.luau) into it.
   *(No Rojo, no Wally, no build step — copy-paste one file.)*
3. In any `Script` under **ServerScriptService**:

   ```lua
   local ServerScriptService = game:GetService("ServerScriptService")
   local PollinationsNPC = require(ServerScriptService.PollinationsNPC)

   local shopkeeper = PollinationsNPC.new({
       secretName = "POLLINATIONS_API_KEY",   -- Cloud Secret name
       persona    = "You are Mara, a cheerful potion shopkeeper in a fantasy village.",
       model      = "openai/gpt-5.4-nano",    -- any model from the live list
   })

   -- players say "@Mara hello" in chat -> Mara answers
   game.Players.PlayerAdded:Connect(function(player)
       player.Chatted:Connect(function(message)
           shopkeeper:Respond(player, message, function(reply)
               print("[Mara]", reply)
               -- e.g. show reply in a BillboardGui or chat
           end)
       end)
   end)
   ```

### 3. Store the API key as a Cloud Secret

1. Create a **Cloud Secret** named `POLLINATIONS_API_KEY` (allowed domain `*`)
   in the **Creator Dashboard → your experience → Secrets**.
2. For local playtesting, add a **local secret** in
   **Studio → File → Experience Settings → Security → Secrets**
   (`{"POLLINATIONS_API_KEY": ["<base64-of-your-key>", "*"]}`).
3. Secrets are loaded at server start — **restart servers** after creating or
   updating a secret.

### 4. Enable HTTP requests

- **File → Experience Settings → Security → Allow HTTP Requests → On.**

### 5. Try the playable example place

Follow [`luau/ExamplePlace.md`](luau/ExamplePlace.md) to build a 5-minute
example place with one talking NPC, or playtest the included `TalkingNPC`
script: walk up to Bramble, press the prompt, then type in chat:

```
@Bramble what is there to do in Pollington?
```

Bramble answers live via the Pollinations text API.

## API call evidence

The module calls `POST https://gen.pollinations.ai/v1/chat/completions` with a
real `sk_` key. Verified live during development (2026-10-03, model
`openai/gpt-5.4-nano` from the live model list):

**Request**

```json
{
  "model": "openai/gpt-5.4-nano",
  "messages": [
    {
      "role": "system",
      "content": "You are Bramble, a grumpy but lovable tavern keeper NPC in a Roblox game. Reply in 1-2 short sentences, in character, like a video game NPC. Never break character."
    },
    {
      "role": "user",
      "content": "Hey Bramble, what do you have on the menu today?"
    }
  ],
  "temperature": 0.8,
  "max_tokens": 120
}
```

**Response** (HTTP 200, `id: chatcmpl-EUfTsGFwmomZklQe6aIDzp0Ln695T`)

```json
{
  "model": "gpt-5.4-nano-2026-03-17",
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "Hmph—today's menu's got hearty stew, tough-but-tasty jerky, and a fresh loaf if you don't mind sharing. Don't just stand there; pick your poison before the next batch runs out."
      },
      "finish_reason": "stop"
    }
  ]
}
```

## FAQ

- **Why secrets + server scripts?** `sk_` keys give full account access and
  must never ship to clients. Roblox Cloud Secrets keeps them out of source
  code, and server-side `HttpService` calls keep them off the client.
- **Which models?** Any text model from https://gen.pollinations.ai/text/models.
- **How do users pay?** Bring your own Pollen — each player's/game's key is
  billed against its own Pollen balance (https://enter.pollinations.ai).
- **What about the example place URL?** Publish the example place from Studio
  (`luau/ExamplePlace.md` §"How to publish it") to get a public
  `https://www.roblox.com/games/<placeId>` playable URL.

## License

MIT — see the repository root for details. Built for the
[Pollinations quest #15583](https://github.com/pollinations/pollinations/issues/15583).
