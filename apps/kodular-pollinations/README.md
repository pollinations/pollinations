# Pollinations extension for Kodular

Add Pollinations AI to your Kodular app with one extension — text, images,
speech, transcription and vision — where **the app's users sign in and pay with
their own Pollen**. Built for quest
[#17248](https://github.com/pollinations/pollinations/issues/17248).

- **Ready-made extension:** import [`PollinationsKodular.aix`](./PollinationsKodular.aix)
  (built from this source) into your project.
- **Sample project:** [`sample/PollinationsKodularDemo.aia`](./sample/PollinationsKodularDemo.aia)
  — a working chat demo with the extension already bundled and wired.
- **Tested-in-Kodular by design:** conservative runtime usage, no dependencies,
  Java 7 bytecode, Kodular-friendly file paths (details below).

## Why App Inventor extensions break in Kodular — and what this one does

Kodular is a fork of MIT App Inventor; extensions written against newer MIT-only
runtime classes or with library dependencies often fail on Kodular's build
server. This extension is deliberately conservative:

- Only runtime classes that have existed **unchanged in both forks since 2013**
  (`AndroidNonvisibleComponent`, `Form`, `EventDispatcher`, listeners).
- **Zero dependencies, no `@UsesLibraries`, no AndroidX** — just `java.net`,
  `org.json` (both ship with Android) and framework classes.
- **Java 7 syntax** (no lambdas/streams), so the compiled classes pass through
  any `dx`/`d8` version the Kodular build server uses.
- Files (images, speech, recordings) are written to the **app-scoped external
  files dir** — no storage permission on any Android version. Relative paths are
  additionally resolved against Kodular's `/storage/emulated/0/Kodular/data`
  *and* App Inventor's `/storage/emulated/0/AppInventor/data` roots, so assets
  made by either toolchain can be read.
- Events always dispatch on the main thread; all network work is off it.

## Install (Kodular Creator)

1. Download [`PollinationsKodular.aix`](./PollinationsKodular.aix).
2. In [Kodular Creator](https://creator.kodular.io), open your project and drag
   the file onto the palette (or **Extension → Import**). It appears under
   **Extension → Pollinations** (`io.kodular.pollinations` namespace).
3. Drop a `Pollinations` component on the screen (non-visible, like a Clock).
4. Or start from the sample: **Projects → Import project (.aia)** with
   `sample/PollinationsKodularDemo.aia` — the extension is already bundled.

## The blocks

| Block | Fires | What it does |
| --- | --- | --- |
| `SignIn` | `ShowVerificationCode(verificationUri, userCode)` → `SignedIn(userName)` / `SignInFailed(reason)` | Opens the Bring-Your-Own-Pollen device flow in the browser; the user approves with their Pollen account. **No API key ships inside your app.** |
| `SignOut` | — | Forgets the sign-in key. |
| `SetApiKey(key)` | — | Use an `sk_` key directly (e.g. for testing). |
| `IsSignedIn` | returns boolean | True once a key is available. |
| `Chat(prompt, model)` | `GotChat(response)` | Ask any text model (empty model = the default `openai/gpt-5.4-nano`). |
| `ChatWithHistory(prompt, historyJson, model)` | `GotChat(response)` | Multi-turn conversation — pass back the JSON from `GotChat`. |
| `GenerateImage(prompt, model, width, height)` | `GotImage(filePath)` | Saves a generated image and returns its path (set it into an `Image.Picture`). |
| `Speak(text, voice)` | `GotSpeech(filePath)` | Text-to-speech, saved as mp3. |
| `PlaySpeech(filePath)` | — | Plays the mp3 from `GotSpeech`. |
| `StopSpeech` | — | Stops playback. |
| `Transcribe(recordingPath)` | `GotTranscription(text)` | Speech-to-text — pass the path from the SoundRecorder component. **The thing the Web component can't do** (multipart upload). |
| `AskAboutImage(prompt, imagePath)` | `GotImageAnswer(answer)` | Vision — ask a text model about a picked image. |
| `ListModels(category)` | `GotModels(models)` | Live model lists for `"text"`, `"image"` or `"audio"`. |

Errors on any call fire `GotError(function, message)` with a readable reason
(401 → sign in first, 429 → rate limit, and so on).

Designer property: `AppKey` — an optional `pk_` key so your app's Pollinations
traffic is attributed to your account.

## Sign-in: Bring Your Own Pollen

`SignIn` starts the device flow from
[BRING_YOUR_OWN_POLLEN.md](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md):
the user opens the verification URL, enters/confirms the code, and approves with
their Pollen account. The extension polls until the key arrives — the user's
own balance pays for every request, and they can revoke it any time from
[enter.pollinations.ai/keys](https://enter.pollinations.ai/keys). Your app never
sees or ships an API key.

## Build from source

Builds with the official
[mit-cml/extension-template](https://github.com/mit-cml/extension-template):

```bash
git clone --recurse-submodules https://github.com/mit-cml/extension-template.git
rm -rf extension-template/src/*
cp -r apps/kodular-pollinations/src/io extension-template/src/
cd extension-template && ant all   # → out/io.kodular.pollinations.aix
```

JDK 17 works (JDK 20+ does not — the build targets Java 7). CI recipe:
[`.github/workflows/build.yml`](./.github/workflows/build.yml) — copy it to the
repository root (or a fork) and it builds and uploads the `.aix` on every push.

Source: [`src/io/kodular/pollinations/Pollinations.java`](./src/io/kodular/pollinations/Pollinations.java).
