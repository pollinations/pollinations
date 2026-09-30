# Pollinations Godot Add-on

[![Quest](https://img.shields.io/badge/Quest-%2315579%20(FIXED)-blue)](https://github.com/pollinations/pollinations/issues/15579)
[![Godot](https://img.shields.io/badge/Godot-4.3%2B-478bff)](https://godotengine.org/)

GDScript add-on that lets Godot 4 developers generate **text, images, and speech** with [Pollinations AI](https://pollinations.ai) inside their games.

## Features

- **Nodes** for text, image, and speech generation — usable from GDScript
- **Async API** with Promises
- **Live model catalog** — fetch available text, image, and audio models
- **OAuth 2.0 Device Flow** (BYOP) — players pay with their own Pollen
- **Example scene** included
- Submit to Godot Asset Library

## Installation

### Via Godot Asset Library (coming soon)

1. Open Godot 4
2. Go to **AssetLib → Search "Pollinations"**
3. Click **Download** and enable the plugin

### Manual

1. Download this repository
2. Copy the `addon/pollinations/` folder to `<your-project>/addons/pollinations/`
3. In Godot, go to **Project → Project Settings → Plugins**
4. Enable **Pollinations AI**

## Quick Start

### Setup

```gdscript
# Create a client and assign your API key
var client = PollinationsClient.new()
client.api_key = "sk_..." # Get one at https://enter.pollinations.ai/keys
add_child(client)

# Optionally fetch live models
var catalog = ModelCatalog.new(client)
add_child(catalog)
await catalog.refresh()
```

### Generate text

```gdscript
var gen = PollinationsText.new()
gen.client = client
gen.prompt = "Describe a fantasy tavern"
var text = await gen.generate()
print(text)  # generated text
```

### Generate an image

```gdscript
var gen = PollinationsImage.new()
gen.client = client
gen.prompt = "A cyberpunk city at night"
gen.width = 512
gen.height = 512
var tex = await gen.generate()
# Apply to a Quad or save to disk
gen.save_to_disk("user://output.png")
```

### Generate speech

```gdscript
var gen = PollinationsSpeech.new()
gen.client = client
gen.prompt = "Hello, adventurer!"
gen.voice = "nova"
var clip = await gen.generate()
# Play on AudioStreamPlayer
var player = AudioStreamPlayer.new()
add_child(player)
gen.play_on(player)
```

## API Endpoints

| Feature | Endpoint |
|---|---|
| Text (chat) | `POST https://gen.pollinations.ai/v1/chat/completions` |
| Image | `GET https://image.pollinations.ai/{prompt}?model=&width=&height=` |
| Speech | `GET https://gen.pollinations.ai/audio/{prompt}?voice=&model=` |
| Models | `GET https://gen.pollinations.ai/{text\|image\|audio}/models` |
| Device flow | `POST https://enter.pollinations.ai/device` |

## BYOP (Bring Your Own Pollen)

Players can authenticate with their own Pollinations account:

```gdscript
var auth = PollinationsAuth.new()
auth.client_id = "pk_..."
var result = await auth.start_device_flow()
# Show user: result.verification_uri + result.user_code
# User visits URL, enters code

# Poll for token
while result.state == DeviceFlowState.Pending:
    result = await auth.poll_token(result.device_code)
    await get_tree().create_timer(5.0).timeout

if result.state == DeviceFlowState.Granted:
    client.api_key = result.access_token
```

## License

MIT — see [CHANGELOG.md](CHANGELOG.md) for release notes.

## Quest

This add-on fulfills [Quest #15579](https://github.com/pollinations/pollinations/issues/15579) — _[QUEST] Pollinations add-on for Godot 4_
