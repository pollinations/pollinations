# Pollinations extension for MIT App Inventor

Add Pollinations AI to your App Inventor app with one extension — text, images,
speech, transcription and vision — where **the app's users sign in and pay with
their own Pollen**. Built for quest
[#17247](https://github.com/pollinations/pollinations/issues/17247).

- **Ready-made extension:** import [`Pollinations.aix`](./Pollinations.aix) (built
  from this source) into your project.
- **Sample project:** [`sample/PollinationsDemo.aia`](./sample/PollinationsDemo.aia)
  — a working chat demo with the extension already bundled and wired.
- No dependencies: the extension uses only `java.net`/`org.json`, both part of
  Android.

## Install

1. Download [`Pollinations.aix`](./Pollinations.aix).
2. In the App Inventor designer, open your project and drag the file onto the
   palette (or **Extension → Import**). The extension appears under
   **Extension → Pollinations**.
3. Drop a `Pollinations` component on the screen (non-visible, like a Clock).
4. For the demo experience, instead just **Projects → Import project (.aia)** with
   `sample/PollinationsDemo.aia` — it already contains the extension.

## The blocks

| Block | Fires | What it does |
| --- | --- | --- |
| `SignIn` | `SignInStarted(url, userCode)` → `SignedIn` / `SignInFailed(reason)` | Opens the Bring-Your-Own-Pollen device flow in the browser; the user approves with their Pollen account and the app receives a scoped key. **No API key ships inside your app.** |
| `SignOut` | — | Forgets the sign-in key. |
| `SetApiKey(key)` | — | Use an `sk_` key directly (e.g. for testing). |
| `IsSignedIn` | returns boolean | True once a key is available. |
| `Chat(prompt, model)` | `GotChat(response)` | Ask any text model (empty model = the default `openai/gpt-5.4-nano`). |
| `ChatWithHistory(prompt, historyJson, model)` | `GotChat(response)` | Multi-turn conversation — pass back the JSON from `GotChat`. |
| `GenerateImage(prompt, model, width, height)` | `GotImage(fileName)` | Saves a generated image into the app's default directory and returns its absolute path (set it into a `Image.Picture`). |
| `Speak(text, voice)` | `GotSpeech(fileName)` | Text-to-speech, saved as mp3. |
| `SpeakAndPlay(text, voice)` | `GotSpeech(fileName)`, `AfterSpeaking` | Speaks and plays immediately. |
| `StopSpeaking` | — | Stops playback. |
| `Transcribe(recordingPath)` | `GotTranscription(response)` | Speech-to-text from a recording — pass the path `SoundRecorder` gives you. **The thing the Web component can't do** (multipart upload). |
| `AskAboutImage(prompt, imagePath, model)` | `GotImageAnswer(answer)` | Vision — ask a text model about a picked image (`ImagePicker.Selection`, a `content://` URI, a file path or a data-URI string). |
| `ListModels(category)` | `GotModels(modelsJson)` | Live model lists for `"text"`, `"image"` or `"audio"`. |

Errors on any call fire `GotError(function, message)` with a readable reason
(401 → sign in first, 429 → rate limit, and so on).

Designer properties: `TextModel`, `ImageModel`, `SpeechModel`, `Voice` defaults,
`AppKey` (optional `pk_` key so your app's traffic is attributed to you), and
`RememberSignIn` (keep the signed-in key across app restarts in the app's private
storage — off by default).

## Sign-in: Bring Your Own Pollen

`SignIn` starts the device flow from
[BRING_YOUR_OWN_POLLEN.md](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md):
the user opens the verification URL, enters/confirms the code, and approves with
their Pollen account. The extension polls until the key arrives — the user's own
balance pays for every request, and they can revoke it any time from
[enter.pollinations.ai/keys](https://enter.pollinations.ai/keys). Your app never
sees or ships an API key.

## Build from source

The extension builds with the official
[mit-cml/extension-template](https://github.com/mit-cml/extension-template):

```bash
git clone --recurse-submodules https://github.com/mit-cml/extension-template.git
rm -rf extension-template/src/*
cp -r apps/appinventor-pollinations/src/appinventor extension-template/src/
cd extension-template && ant all   # → out/appinventor.ai_pollinations.aix
```

JDK 17 works (JDK 20+ does not — the build targets Java 7). CI recipe:
[`.github/workflows/build.yml`](./.github/workflows/build.yml) — copy it to the
repository root (or a fork) and it builds and uploads the `.aix` on every push.

Source: [`src/appinventor/ai_pollinations/Pollinations.java`](./src/appinventor/ai_pollinations/Pollinations.java).
