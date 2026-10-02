# Example Place — Talking Bramble

This folder documents how to build the **playable example place** for the app:
a tiny Roblox experience with one talking NPC (Bramble) whose dialogue is
powered by Pollinations text models through the `PollinationsNPC` module.

## What the place contains

| Object | Type | Purpose |
|---|---|---|
| `Bramble` (Part in Workspace) | `BasePart` | The visible NPC body |
| `ProximityPrompt` (child of Bramble) | `ProximityPrompt` | "Talk to Bramble" — press E near her |
| `SpeechBubble` (BillboardGui child of Bramble) | `BillboardGui` | Shows Bramble's current reply above her head |
| `PollinationsNPC` (ModuleScript) | `ModuleScript` | The SDK module from this repo (`luau/PollinationsNPC.luau`) |
| `TalkingNPC` (Script) | `Script` | Server script wiring the NPC to chat (`luau/TalkingNPC.server.luau`) |

## How to run it (Roblox Studio, ~5 minutes)

1. **Create the place**
   - Open Roblox Studio → New → Baseplate. (Or your own template — anything works.)

2. **Add the NPC part**
   - In the **Explorer**, select `Workspace`, insert a `Part`, rename it to `Bramble`.
   - Set its color (e.g. a warm orange `Color3.fromRGB(210, 130, 60)`) so she is easy to find.
   - Insert a `ProximityPrompt` as a **child of Bramble** and set:
     - ActionText: `Talk`
     - ObjectText: `Bramble`
   - Position the part somewhere visible on the map.

3. **Add the scripts**
   - Under `ServerScriptService`, create a `ModuleScript` named `PollinationsNPC`
     and paste the contents of `luau/PollinationsNPC.luau` into it.
   - Under `ServerScriptService`, create a `Script` named `TalkingNPC`
     and paste the contents of `luau/TalkingNPC.server.luau` into it.

4. **Store the API key in Cloud Secrets**
   - In Studio, open **File → Experience Settings → Security → Secrets** and add
     a local secret (for playtesting) named `POLLINATIONS_API_KEY` with your
     Pollinations API key, or create it in the **Creator Dashboard → your
     experience → Secrets** (key name `POLLINATIONS_API_KEY`, domain `*`).
     - Local secret values must be **Base64-encoded** inside the Studio JSON
       field, e.g. `{"POLLINATIONS_API_KEY": ["c2stZXhhbXBsZQ==", "*"]}`.
     - In a published game the Dashboard secret is used automatically.

5. **Enable HTTP requests**
   - **File → Experience Settings → Security → Allow HTTP Requests → On.**

6. **Playtest**
   - Press **Play**. Walk up to Bramble, press **E** (or the key bound to the
     ProximityPrompt), then type in the chat bar:
     ```
     @Bramble what is there to do in Pollington?
     ```
   - Bramble replies in the chat and in the speech bubble above her head,
     generated live by the Pollinations text model.

## How to publish it (playable App URL)

1. **File → Publish to Roblox** (or **Publish to Roblox As...** if this is a
   new experience). Set a name like "Pollinations NPC Demo".
2. The experience gets a public URL:
   `https://www.roblox.com/games/<placeId>/Pollinations-NPC-Demo`
3. That URL is the playable example place you can use as the App URL for the
   app catalog entry.
4. If you also want the game discoverable, publish the scripts as a free
   **Model / Plugin** on the Creator Store.

## Troubleshooting

- `Can't find secret with given key` → the secret is missing or you are in a
  client script. Secrets are server-only. Local playtesting needs the Studio
  local secret; published games need the Creator Dashboard secret. Restart
  servers after changing a secret (servers load secrets at startup).
- `HTTP 400` → check the model name against the live list at
  https://gen.pollinations.ai/text/models
- No reply but no error → enable `warn` output; `TalkingNPC` logs failures.
  Verify the API key has Pollen balance (https://enter.pollinations.ai).
