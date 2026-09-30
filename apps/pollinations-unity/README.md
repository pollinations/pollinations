# Pollinations Unity SDK

[![OpenUPM](https://img.shields.io/npm/v/com.pollinations.unity)](https://openupm.com/packages/com.pollinations.unity)
[![Quest](https://img.shields.io/badge/Quest-%2315580%20(FIXED)-blue)](https://github.com/pollinations/pollinations/issues/15580)

C# package that lets Unity developers generate **text, images, and audio** with [Pollinations AI](https://pollinations.ai) inside their games and applications.

## Features

- **Async text generation** via OpenAI-compatible `/v1/chat/completions` endpoint
- **Image generation** with configurable models, dimensions, and nologo
- **Speech/audio generation** with multiple voice options
- **Live model catalog** — fetch available text, image, and audio models from the API
- **OAuth 2.0 Device Flow** (BYOP) — players pay with their own Pollen
- **Sample scene** with demo UI for all three generation types

## Installation

### Via OpenUPM (recommended)

```bash
openupm add com.pollinations.unity
```

### Manual (git URL)

1. Open **Package Manager** in Unity
2. Click **+ → Add package from git URL**
3. Enter: `https://github.com/g33ky00/pollinations-unity-sdk.git#main`

### Manual (local)

1. Download this repository
2. In Unity, open **Package Manager** → **+** → **Add package from disk**
3. Select the `package.json` file

## Quick Start

### 1. Add the client to your scene

```csharp
using Pollinations.Unity;

var client = gameObject.AddComponent<PollinationsClient>();
client.ApiKey = "sk_..."; // Get your key at https://enter.pollinations.ai/keys
```

### 2. Generate text

```csharp
string response = await client.GenerateText(
    prompt: "Describe a fantasy tavern",
    model: "openai/gpt-5.4-nano",
    maxTokens: 512
);
Debug.Log(response);
```

### 3. Generate an image

```csharp
Texture2D texture = await client.GenerateImage(
    prompt: "A cyberpunk city at night",
    model: "gptimage",
    width: 512,
    height: 512,
    nologo: true
);
// Assign to a RawImage or Renderer
```

### 4. Generate speech

```csharp
AudioClip clip = await client.GenerateSpeech(
    prompt: "Hello, adventurer!",
    voice: "nova",
    model: "openai/gpt-4o-mini-tts"
);
audioSource.clip = clip;
audioSource.Play();
```

### 5. List available models

```csharp
List<ModelInfo> textModels = await client.GetTextModels();
foreach (var m in textModels)
    Debug.Log($"{m.title} ({m.name}) — {m.publisher}");
```

## BYOP (Bring Your Own Pollen)

Let players pay with their own Pollen balance using the OAuth Device Flow:

```csharp
var auth = gameObject.AddComponent<PollinationsAuth>();
auth.ClientId = "pk_..."; // Your publishable key

var result = await auth.StartDeviceFlow();
// Show the user: result.VerificationUri + result.UserCode
// User visits the URL and enters the code

// Poll until user completes auth
while (result.State == DeviceFlowState.Pending)
{
    result = await auth.PollToken(result.UserCode); // note: use the device_code returned initially
    await Task.Delay(5000); // respect the interval
}

if (result.State == DeviceFlowState.Granted)
{
    client.ApiKey = result.AccessToken;
}
```

## Default Models

| Generation | Default Model |
|---|---|
| Text | `openai/gpt-5.4-nano` |
| Image | `gptimage` |
| Speech | `openai/gpt-4o-mini-tts` |

## API Endpoints

| Feature | Endpoint |
|---|---|
| Text (chat) | `POST https://gen.pollinations.ai/v1/chat/completions` |
| Image | `GET https://image.pollinations.ai/{prompt}?model=&width=&height=` |
| Speech | `GET https://gen.pollinations.ai/audio/{prompt}?voice=&model=` |
| Models | `GET https://gen.pollinations.ai/{text\|image\|audio}/models` |
| Device flow | `POST https://enter.pollinations.ai/device` |

## Testing

Run the Unity Test Runner to verify the client against live endpoints using the provided test key.

## License

MIT — see [CHANGELOG.md](CHANGELOG.md) for release notes.

## Quest

This package fulfills [Quest #15580](https://github.com/pollinations/pollinations/issues/15580) — _[QUEST] Pollinations package for Unity_
