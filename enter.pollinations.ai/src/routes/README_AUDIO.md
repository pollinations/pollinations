# Audio Routes - Text-to-Speech API


## Parameters

### `model` (string, optional)
- **Default:** `"tts-1"`
- **Description:** Currently maps to ElevenLabs TTS models
- **Example:** `"tts-1"`

### `input` (string, required)
- **Min Length:** 1 character
- **Max Length:** 4096 characters
- **Description:** The text to generate audio for
- **Example:** `"Hello, welcome to Pollinations!"`

### `voice` (string, optional)
- **Default:** `"alloy"`
- **Description:** The voice to use for speech synthesis
- **Supported Voices:**
  - **OpenAI Voices:** alloy, echo, fable, onyx, nova, shimmer
  - **Extended Voices:** ash, ballad, coral, sage, verse
  - **ElevenLabs Voices:** rachel, domi, bella, elli, charlotte, dorothy, sarah, emily, lily, adam, antoni, arnold, josh, sam, daniel, charlie, james, fin, callum, liam, george, brian, bill, matilda
- **Example:** `"rachel"`

### `response_format` (string, optional)
- **Default:** `"mp3"`
- **Supported Formats:** mp3, opus, aac, flac, wav, pcm
- **Description:** Audio file format for the output
- **Example:** `"mp3"`

### `speed` (number, optional)
- **Default:** `1.0`
- **Min:** `0.25`
- **Max:** `4.0`
- **Description:** Playback speed of generated audio (0.25 = 25% speed, 4.0 = 400% speed)
- **Example:** `1.5`

## Request Examples

### Basic Request (cURL)
```bash
curl -X POST https://gen.pollinations.ai/speech \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": "Hello world"
  }' \
  --output audio.mp3
```

### With Custom Voice and Format
```bash
curl -X POST https://gen.pollinations.ai/speech \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": "The quick brown fox jumps over the lazy dog",
    "voice": "rachel",
    "response_format": "wav",
    "speed": 1.2
  }' \
  --output audio.wav
```

### JavaScript/TypeScript
```javascript
const response = await fetch('https://gen.pollinations.ai/speech', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    input: 'Generating speech from text',
    voice: 'alloy',
    response_format: 'mp3',
    speed: 1.0,
  }),
});

const audioBlob = await response.blob();
const audioUrl = URL.createObjectURL(audioBlob);
```

## Response

### Success Response (200)
- **Content-Type:** Varies by `response_format` parameter
  - `mp3` → `audio/mpeg`
  - `opus` → `audio/opus`
  - `aac` → `audio/aac`
  - `flac` → `audio/flac`
  - `wav` → `audio/wav`
- **Body:** Binary audio data
- **Headers:**
  - `x-model-used`: Model used (e.g., "elevenlabs")
  - `x-usage-completion-audio-tokens`: Number of audio tokens
  - `x-usage-total-tokens`: Total tokens used
  - `x-tts-voice`: Voice used
  - `x-usage-characters`: Number of input characters


## Voice Characteristics

| Voice | Type | Characteristics |
|-------|------|-----------------|
| rachel | ElevenLabs | Calm, conversational |
| domi | ElevenLabs | Strong, confident |
| bella | ElevenLabs | Soft, gentle |
| elli | ElevenLabs | Young, bright |
| charlotte | ElevenLabs | Sophisticated, seductive |
| dorothy | ElevenLabs | Pleasant, British |
| adam | ElevenLabs | Deep, natural |
| antonio | ElevenLabs | Well-rounded, calm |
| alloy | OpenAI | General purpose |
| echo | OpenAI | Echo effect |
| fable | OpenAI | Storytelling |
| onyx | OpenAI | Deep, warm |
| nova | OpenAI | Professional |
| shimmer | OpenAI | Clear, bright |

## Audio Format Details

| Format | Codec | Bitrate | Use Case |
|--------|-------|---------|----------|
| mp3 | MP3 | 128 kbps @ 44.1kHz | Default, web streaming |
| opus | Opus | 16kHz | Voice chat, streaming |
| aac | AAC | 44.1kHz | Apple devices, high quality |
| flac | FLAC | 44.1kHz | Lossless, archival |
| wav | WAV | 44.1kHz | Lossless, professional |
| pcm | PCM | 44.1kHz | Raw audio, low latency |

## Speed Mapping

The `speed` parameter is converted to ElevenLabs stability settings:
- Speed 0.25 → Stability 1.0 (maximum stability)
- Speed 1.0 → Stability 1.0 (normal)
- Speed 4.0 → Stability 0.5 (lower stability for faster playback)

Formula: `stability = Math.max(0, Math.min(1, 1.5 - speed * 0.5))`
