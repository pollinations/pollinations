## Audio Generation

Text-to-speech, music generation, and audio transcription.

| Endpoint | Description |
|----------|-------------|
| `GET /audio/{text}` | Simple URL-based TTS or music generation |
| `POST /v1/audio/speech` | OpenAI-compatible TTS |
| `POST /v1/audio/transcriptions` | Speech-to-text transcription |

**Audio models:** {{AUDIO_MODELS}}

**Available voices:** {{ELEVENLABS_VOICES}}

### Authentication

`POST /v1/audio/speech`, `POST /v1/audio/transcriptions`, and music models on
those routes require a Pollinations API key (`Authorization: Bearer sk_...` or
`pk_...`). Requests without a key return **401** with
`code: "UNAUTHORIZED"` — this is expected, not an audio-model outage.

Create a key at [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys).
Anonymous URL calls to `GET /audio/{text}` may still work for a limited set of
public voices; prefer authenticated `/v1/audio/*` for production.

If you already send a key and still see **400**, check `model`, `voice`, and
`response_format` against the model catalog — format mismatches return 400 with
an explicit message (for example Lyria and ElevenLabs sound-effects only support
`mp3`).


