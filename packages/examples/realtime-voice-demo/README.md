# Pollinations realtime voice demo

A minimal push-to-talk voice app. Audio capture, playback and the Realtime
WebSocket all run in the browser through `@pollinations/sdk`; there is no
backend or proxy.

## Run

1. Create a secret key (`sk_…`) at https://enter.pollinations.ai/keys. Realtime
   sessions bill one total when the socket closes, so the account needs a
   positive balance.
2. Serve this directory with any static file server, for example:

```bash
npx serve . --listen 8790
```

3. Open http://localhost:8790, paste the key, and press **Connect**.
4. Hold **Hold to talk**, speak, then release. **Stop response** interrupts the
   answer.

The key stays in memory. A production app should sign the user in through
`PolliProvider` and read the delegated key from `useAuth` instead.

## Switching models

`index.html` uses the default `openai/gpt-realtime-2.1`. Pass another model to
`openRealtimeSession`:

| Model | Use |
|---|---|
| `google/gemini-3.8-live` | Voice sessions at lower latency |
| `openai/gpt-realtime-2.1-mini` | Cheaper voice sessions |
| `elevenlabs/scribe-v3-live` | Live transcription; events are `conversation.item.input_audio_transcription.*` |

`microsoft/mai-transcribe-2-streaming` also needs
`session: { type: "transcription" }`. See the
[Realtime reference](https://gen.pollinations.ai/docs#realtime).
