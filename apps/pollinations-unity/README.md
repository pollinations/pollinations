# Pollinations for Unity

A small, dependency-free Unity Package Manager client for Pollinations text, image,
speech, live model lists, and player-funded device authorization.

## Install

In Unity 2021.3+, open **Window → Package Manager → + → Add package from git URL…**

```text
https://github.com/Marcus-Mok-GH/pollinations-openclaw-harness.git?path=/apps/pollinations-unity
```

The package is also available from this repository when checked out locally:

```text
https://github.com/pollinations/pollinations.git?path=/apps/pollinations-unity
```

## Quick start

```csharp
using Pollinations.Unity;

var client = new PollinationsClient { ApiKey = "sk_your_development_key" };

var text = await client.TextAsync("Give my NPC one cheerful sentence.");
var image = await client.ImageAsync("a cozy pixel-art tavern", width: 512, height: 512);
var speech = await client.SpeechAsync(text.Text);

rawImage.texture = image.Texture;
audioSource.clip = speech.Clip;
audioSource.Play();
```

All calls are `Task`-based and accept a `CancellationToken`. The runtime uses only
Unity's built-in `UnityWebRequest`, `JsonUtility`, `Texture2D`, and
`DownloadHandlerAudioClip`; there are no package dependencies.

## API coverage

| API | Client method | Endpoint |
| --- | --- | --- |
| Text | `TextAsync` | `POST https://gen.pollinations.ai/v1/chat/completions` |
| Image | `ImageAsync` | `POST https://gen.pollinations.ai/v1/images/generations` |
| Speech | `SpeechAsync` | `POST https://gen.pollinations.ai/v1/audio/speech` |
| Live models | `PollinationsModels.FetchAsync` | `GET /text/models`, `/image/models`, `/audio/models` |
| Player-funded auth | `PollinationsAuth.AuthorizeAsync` | `POST https://enter.pollinations.ai/api/device/code` and `/api/device/token` |

`ImageAsync` accepts both `b64_json` and URL image responses. `SpeechAsync` returns a
decoded `AudioClip`, including WAV and Unity-supported compressed formats.

## Development key and device flow

For local development, set `PollinationsClient.ApiKey` from
[enter.pollinations.ai/keys](https://enter.pollinations.ai/keys). Never commit this
key or serialize it into a scene or prefab.

For a player-funded build, create a publishable `pk_...` App Key and show the returned
code in your UI:

```csharp
var auth = new PollinationsAuth("pk_your_app_key");
var result = await auth.AuthorizeAsync(progress =>
    status.text = progress.Message);

if (result.State == DeviceFlowState.Granted)
    client.DeviceToken = result.AccessToken; // keep in memory only
```

The device flow handles `authorization_pending`, `slow_down`, `access_denied`, and
`expired_token`. It follows the Pollinations [BYOP documentation](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md).

## Demo and verification

The `Samples~/DemoScene` sample contains the smallest end-to-end example: one script
drives text, image, and speech, then updates a `RawImage`, `Text`, and `AudioSource`.
The Unity Test Runner tests credential hygiene, App Key validation, and the wire shape
of the chat message. Run them with **Window → General → Test Runner**.

The package intentionally does not claim an editor build or live generation from a
non-Unity environment. Maintainers can verify both with the included sample in a
clean Unity 2021.3+ project and a temporary development key; no key is bundled in
the package, sample, tests, or scene.

## License

MIT