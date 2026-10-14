# Pollinations for Minecraft

Chatting villagers and prompt-to-map art for Minecraft servers, powered by
[Pollinations](https://pollinations.ai). Server owners add the plugin, set
their own API key, and every player on the server can talk to persona
villagers and turn prompts into map art — paid with the server owner's
Pollen. Built for quest [#17246](https://github.com/pollinations/pollinations/issues/17246).

## Features

- **Villager personas** — right-click a villager named after a persona and it
  talks, in character, with short memory of your conversation. Name a
  villager `Elara`, `Gorik` or `Pip` (anvil or name tag) and see.
- **`/ai`** — chat with any configured persona, each with its own persona,
  model and memory.
- **`/draw`** — generates an image for a prompt and hands you a Minecraft
  map item showing it.
- **Server key management** — `pollinations.admin` players set the API key at
  runtime; it is stored in `config.yml`.
- **Live model lists** — any text or image model from
  [/text/models](https://gen.pollinations.ai/text/models) and
  [/image/models](https://gen.pollinations.ai/image/models) works.

## Install

1. Download `minecraft-pollinations-<version>.jar` (see the app download
   page, or build from source below) and drop it into your server's
   `plugins/` folder.
2. Start the server once; `plugins/Pollinations/config.yml` is created.
3. Create an API key at <https://enter.pollinations.ai/keys> (`sk_...`) and
   either paste it into `config.yml` as `apiKey`, or run in game:
   ```
   /pollinations key sk_yourkeyhere
   ```
   (the runtime command persists the key to config.yml).
4. Restart (or not — the runtime command takes effect immediately) and try:
   ```
   /ai hello, who are you?
   /draw a red dragon over a jungle temple
   /pollinations status
   ```

Requires Java 21 and Minecraft 1.21+ (Paper recommended; see compatibility
notes below). The plugin has zero bundled libraries — it uses only the
server's own dependencies (gson, adventure on Paper) and the JDK.

## Commands

| Command | Permission | What it does |
| --- | --- | --- |
| `/ai <message>` | `pollinations.use` (default: everyone) | Chat with your selected persona (has memory). |
| `/ai persona` | `pollinations.use` | List personas and show the current one. |
| `/ai persona <name>` | `pollinations.use` | Switch persona. |
| `/ai reset` | `pollinations.use` | Clear this persona's memory of you. |
| `/draw <prompt>` | `pollinations.use` | Turn a prompt into an image on a map item. |
| `/pollinations key <sk_...>` | `pollinations.admin` (default: op) | Set the server API key and save it to config.yml. |
| `/pollinations key clear` | `pollinations.admin` | Remove the key (fall back to anonymous). |
| `/pollinations models [text\|image]` | `pollinations.admin` | Live model list from the Pollinations API. |
| `/pollinations status` | `pollinations.admin` | Key (masked), models, personas and a live API health check. |
| right-click named villager | `pollinations.use` | Start a conversation with that villager's persona; type in chat to talk. |
| sneak-right-click villager | `pollinations.use` | End the conversation (it also ends after 60s idle). |

Example session:

```
Steve names a villager "Elara" at an anvil and right-clicks it.
<Elara> Oh! A visitor. Mind the ink, I'm cataloguing.
Steve: [types in chat] what books do you have?
<Elara> Herbals, bestiaries, and one suspicious book on bees.
```

## Villager persona setup

Personas live in `config.yml` under `villagerPersonas` and are shared by
villagers and `/ai`:

```yaml
villagerPersonas:
  - name: Elara                    # name a villager this to bring it to life
    personality: You are Elara, the village librarian. You are kind, curious and full of book recommendations and local gossip. Answer in 1-3 short sentences.
    model: openai/gpt-5.4-nano     # optional, defaults to chatModel
  - name: Gorik
    personality: You are Gorik, the village blacksmith. You are gruff and impatient, but secretly fond of poetry. Answer in 1-3 short sentences.
```

- Matching is case-insensitive and ignores `§` color codes, so name tags
  from plugins work too.
- Each player's conversation with each villager is remembered separately
  (last 10 turns), per persona.
- `model` may be any model from `/pollinations models text`.

## Compatibility notes

- **Paper 1.21+** is the supported and tested platform (built against
  `paper-api` 1.21.8; messages are sent as adventure `Component`s).
- **Spigot 1.21+** should work: the plugin avoids Paper-only calls on the
  Spigot path (chat capture falls back to `AsyncPlayerChatEvent`, messages
  fall back to legacy strings). Not exercised on a live Spigot server.
- **Folia** is untested and not expected to work out of the box: the plugin
  uses the global Bukkit scheduler to hop back to the main thread after API
  calls.
- All Pollinations API calls happen off the main thread via
  `java.net.http.HttpClient` and `CompletableFuture`; results are delivered
  back on the main thread with the Bukkit scheduler. A per-player cooldown
  (default 3 seconds, `cooldownSeconds` in config.yml) protects your Pollen
  from spam.

## Configuration

```yaml
apiKey: ""                          # https://enter.pollinations.ai/keys
chatModel: openai/gpt-5.4-nano     # default text model
imageModel: tongyi-mai/z-image-turbo # default image model
maxImageSize: 1024                  # square image resolution for /draw
requestTimeout: 60                  # seconds per API call
cooldownSeconds: 3                  # per-player minimum between requests
villagerPersonas: [ ... ]           # see above
```

## Build from source

Requires JDK 21 and Maven:

```sh
mvn package
# -> target/minecraft-pollinations-<version>.jar
```

Tests (`mvn test`) cover the pure logic: image-to-map palette conversion
(scaling, transparency, gradients), persona config parsing and lookup,
conversation memory caps, per-player cooldowns, error mapping and display
helpers. A live smoke test of the API client (chat, models, image → map
bytes) was run manually against `gen.pollinations.ai` during development.

Continuous integration: this folder ships
[.github/workflows/build.yml](.github/workflows/build.yml). GitHub only
picks up workflows from the repository root, so to enable CI for this app,
copy that file to `.github/workflows/minecraft-pollinations.yml` at the
repository root — it builds the jar with Maven 21 and uploads it as an
artifact on every push or pull request touching this folder.

## Security note

The server API key spends the **server owner's** Pollen for every player
request — that is the design ("server owners pay with their own Pollen").
Treat the key like a password:

- Only give `pollinations.admin` (default: ops) to trusted staff; the key is
  set and stored via that permission.
- `config.yml` is written inside `plugins/Pollinations/`; keep backups and
  logs private, and rotate the key at
  <https://enter.pollinations.ai/keys> if it leaks.
- Rate limit (429) and balance errors surface in chat with a hint to check
  the key; anonymous requests (no key) are heavily rate-limited.

## How it talks to the API

- Text: `POST https://gen.pollinations.ai/v1/chat/completions`
  (OpenAI-compatible, `Authorization: Bearer <key>`).
- Image: `GET https://gen.pollinations.ai/image/<prompt>?model=...&width=...&height=...`
  → JPEG bytes, scaled to 128×128 and converted to `MapPalette` colors.
- Models: `GET /text/models`, `GET /image/models`.

API docs: <https://gen.pollinations.ai/docs>
