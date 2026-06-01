// Static API examples injected into the merged OpenAPI schema by
// injectSamples() in docs.ts: per-endpoint multi-language code samples
// (x-codeSamples) and example 200 responses. Pure data — no logic.

export const CODE_SAMPLES: Record<
    string,
    { label: string; lang: string; source: string }[]
> = {
    "post /account/keys": [
        {
            label: "Create app key",
            lang: "Shell",
            source: `curl https://gen.pollinations.ai/account/keys \\
  -H "Authorization: Bearer YOUR_SECRET_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "myapp",
    "type": "publishable",
    "redirectUris": ["https://myapp.com/callback"]
  }'`,
        },
    ],
    "post /v1/chat/completions": [
        {
            label: "cURL",
            lang: "Shell",
            source: `curl https://gen.pollinations.ai/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`,
        },
        {
            label: "Python",
            lang: "Python",
            source: `from openai import OpenAI

client = OpenAI(
    base_url="https://gen.pollinations.ai/v1",
    api_key="YOUR_API_KEY"
)

response = client.chat.completions.create(
    model="openai",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)`,
        },
        {
            label: "JavaScript",
            lang: "JavaScript",
            source: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://gen.pollinations.ai/v1",
  apiKey: "YOUR_API_KEY",
});

const response = await client.chat.completions.create({
  model: "openai",
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(response.choices[0].message.content);`,
        },
    ],
    "get /text/{prompt}": [
        {
            label: "cURL",
            lang: "Shell",
            source: `curl "https://gen.pollinations.ai/text/Write%20a%20haiku?model=openai" \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
        },
        {
            label: "Python",
            lang: "Python",
            source: `import requests

response = requests.get(
    "https://gen.pollinations.ai/text/Write a haiku",
    params={"model": "openai"},
    headers={"Authorization": "Bearer YOUR_API_KEY"},
)
print(response.text)`,
        },
        {
            label: "JavaScript",
            lang: "JavaScript",
            source: `const response = await fetch(
  "https://gen.pollinations.ai/text/Write%20a%20haiku?model=openai",
  { headers: { Authorization: "Bearer YOUR_API_KEY" } },
);
console.log(await response.text());`,
        },
    ],
    "get /image/{prompt}": [
        {
            label: "HTML",
            lang: "HTML",
            source: `<!-- No code needed — use as an image URL -->
<img src="https://gen.pollinations.ai/image/a%20cat%20in%20space?model=flux" />`,
        },
        {
            label: "cURL",
            lang: "Shell",
            source: `# Generate an image
curl "https://gen.pollinations.ai/image/a%20cat%20in%20space?model=flux" \\
  -H "Authorization: Bearer YOUR_API_KEY" -o image.jpg

# Generate a video
curl "https://gen.pollinations.ai/image/a%20sunset%20timelapse?model=veo&duration=4" \\
  -H "Authorization: Bearer YOUR_API_KEY" -o video.mp4`,
        },
        {
            label: "Python",
            lang: "Python",
            source: `import requests

response = requests.get(
    "https://gen.pollinations.ai/image/a cat in space",
    params={"model": "flux"},
    headers={"Authorization": "Bearer YOUR_API_KEY"},
)
with open("image.jpg", "wb") as f:
    f.write(response.content)`,
        },
        {
            label: "JavaScript",
            lang: "JavaScript",
            source: `const response = await fetch(
  "https://gen.pollinations.ai/image/a%20cat%20in%20space?model=flux",
  { headers: { Authorization: "Bearer YOUR_API_KEY" } },
);
const blob = await response.blob();`,
        },
    ],
    "get /video/{prompt}": [
        {
            label: "cURL",
            lang: "Shell",
            source: `curl "https://gen.pollinations.ai/video/a%20sunset%20timelapse?model=veo&duration=4" \\
  -H "Authorization: Bearer YOUR_API_KEY" -o video.mp4`,
        },
        {
            label: "Python",
            lang: "Python",
            source: `import requests

response = requests.get(
    "https://gen.pollinations.ai/video/a sunset timelapse",
    params={"model": "veo", "duration": 4},
    headers={"Authorization": "Bearer YOUR_API_KEY"},
)
with open("video.mp4", "wb") as f:
    f.write(response.content)`,
        },
        {
            label: "JavaScript",
            lang: "JavaScript",
            source: `const response = await fetch(
  "https://gen.pollinations.ai/video/a%20sunset%20timelapse?model=veo&duration=4",
  { headers: { Authorization: "Bearer YOUR_API_KEY" } },
);
const blob = await response.blob();`,
        },
    ],
    "get /audio/{text}": [
        {
            label: "cURL",
            lang: "Shell",
            source: `# Text-to-speech
curl "https://gen.pollinations.ai/audio/Hello%20world?voice=nova" \\
  -H "Authorization: Bearer YOUR_API_KEY" -o speech.mp3

# Generate music (ElevenLabs)
curl "https://gen.pollinations.ai/audio/upbeat%20jazz?model=elevenmusic&duration=30" \\
  -H "Authorization: Bearer YOUR_API_KEY" -o music.mp3

# Generate music (ACE-Step, open-source)
curl "https://gen.pollinations.ai/audio/brazilian%20berimbau%20instrumental?model=acestep&duration=15" \\
  -H "Authorization: Bearer YOUR_API_KEY" -o music.mp3`,
        },
        {
            label: "Python",
            lang: "Python",
            source: `import requests

response = requests.get(
    "https://gen.pollinations.ai/audio/Hello world",
    params={"voice": "nova"},
    headers={"Authorization": "Bearer YOUR_API_KEY"},
)
with open("speech.mp3", "wb") as f:
    f.write(response.content)`,
        },
        {
            label: "JavaScript",
            lang: "JavaScript",
            source: `const response = await fetch(
  "https://gen.pollinations.ai/audio/Hello%20world?voice=nova",
  { headers: { Authorization: "Bearer YOUR_API_KEY" } },
);
const audio = await response.blob();`,
        },
    ],
    "post /v1/audio/speech": [
        {
            label: "cURL",
            lang: "Shell",
            source: `curl https://gen.pollinations.ai/v1/audio/speech \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"input": "Hello world", "voice": "nova"}' \\
  -o speech.mp3`,
        },
        {
            label: "Python",
            lang: "Python",
            source: `from openai import OpenAI

client = OpenAI(
    base_url="https://gen.pollinations.ai/v1",
    api_key="YOUR_API_KEY",
)

response = client.audio.speech.create(
    model="tts-1",
    voice="nova",
    input="Hello world",
)
response.stream_to_file("speech.mp3")`,
        },
        {
            label: "JavaScript",
            lang: "JavaScript",
            source: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://gen.pollinations.ai/v1",
  apiKey: "YOUR_API_KEY",
});

const response = await client.audio.speech.create({
  model: "tts-1",
  voice: "nova",
  input: "Hello world",
});
const buffer = Buffer.from(await response.arrayBuffer());`,
        },
    ],
    "post /v1/audio/transcriptions": [
        {
            label: "cURL",
            lang: "Shell",
            source: `curl https://gen.pollinations.ai/v1/audio/transcriptions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -F file=@audio.mp3 \\
  -F model=whisper-large-v3`,
        },
        {
            label: "Python",
            lang: "Python",
            source: `from openai import OpenAI

client = OpenAI(
    base_url="https://gen.pollinations.ai/v1",
    api_key="YOUR_API_KEY",
)

with open("audio.mp3", "rb") as f:
    transcript = client.audio.transcriptions.create(
        model="whisper-large-v3", file=f
    )
print(transcript.text)`,
        },
        {
            label: "JavaScript",
            lang: "JavaScript",
            source: `import OpenAI from "openai";
import fs from "fs";

const client = new OpenAI({
  baseURL: "https://gen.pollinations.ai/v1",
  apiKey: "YOUR_API_KEY",
});

const transcript = await client.audio.transcriptions.create({
  model: "whisper-large-v3",
  file: fs.createReadStream("audio.mp3"),
});
console.log(transcript.text);`,
        },
    ],
    "get /account/balance": [
        {
            label: "cURL",
            lang: "Shell",
            source: `curl https://gen.pollinations.ai/account/balance \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
        },
        {
            label: "Python",
            lang: "Python",
            source: `import requests

response = requests.get(
    "https://gen.pollinations.ai/account/balance",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
)
print(response.json())  # {"balance": 42.5}`,
        },
        {
            label: "JavaScript",
            lang: "JavaScript",
            source: `const response = await fetch(
  "https://gen.pollinations.ai/account/balance",
  { headers: { Authorization: "Bearer YOUR_API_KEY" } },
);
const { balance } = await response.json();
console.log(balance);`,
        },
    ],
    "get /account/profile": [
        {
            label: "cURL",
            lang: "Shell",
            source: `curl https://gen.pollinations.ai/account/profile \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
        },
        {
            label: "Python",
            lang: "Python",
            source: `import requests

response = requests.get(
    "https://gen.pollinations.ai/account/profile",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
)
profile = response.json()
print(profile["githubUsername"])`,
        },
        {
            label: "JavaScript",
            lang: "JavaScript",
            source: `const response = await fetch(
  "https://gen.pollinations.ai/account/profile",
  { headers: { Authorization: "Bearer YOUR_API_KEY" } },
);
const profile = await response.json();
console.log(profile.githubUsername);`,
        },
    ],
    "get /account/key": [
        {
            label: "cURL",
            lang: "Shell",
            source: `curl https://gen.pollinations.ai/account/key \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
        },
        {
            label: "Python",
            lang: "Python",
            source: `import requests

response = requests.get(
    "https://gen.pollinations.ai/account/key",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
)
key_info = response.json()
print(f"Valid: {key_info['valid']}, Type: {key_info['type']}")`,
        },
        {
            label: "JavaScript",
            lang: "JavaScript",
            source: `const response = await fetch(
  "https://gen.pollinations.ai/account/key",
  { headers: { Authorization: "Bearer YOUR_API_KEY" } },
);
const keyInfo = await response.json();
console.log(\`Valid: \${keyInfo.valid}, Type: \${keyInfo.type}\`);`,
        },
    ],
    "get /v1/models": [
        {
            label: "cURL",
            lang: "Shell",
            source: `curl https://gen.pollinations.ai/v1/models`,
        },
        {
            label: "Python",
            lang: "Python",
            source: `from openai import OpenAI

client = OpenAI(
    base_url="https://gen.pollinations.ai/v1",
    api_key="YOUR_API_KEY",
)

models = client.models.list()
for model in models.data:
    print(model.id)`,
        },
        {
            label: "JavaScript",
            lang: "JavaScript",
            source: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://gen.pollinations.ai/v1",
  apiKey: "YOUR_API_KEY",
});

const models = await client.models.list();
models.data.forEach((m) => console.log(m.id));`,
        },
    ],
    "get /image/models": [
        {
            label: "cURL",
            lang: "Shell",
            source: `curl https://gen.pollinations.ai/image/models`,
        },
        {
            label: "JavaScript",
            lang: "JavaScript",
            source: `const response = await fetch("https://gen.pollinations.ai/image/models");
const models = await response.json();
models.forEach((m) => console.log(\`\${m.id}: \${m.description}\`));`,
        },
    ],
    "get /text/models": [
        {
            label: "cURL",
            lang: "Shell",
            source: `curl https://gen.pollinations.ai/text/models`,
        },
        {
            label: "JavaScript",
            lang: "JavaScript",
            source: `const response = await fetch("https://gen.pollinations.ai/text/models");
const models = await response.json();
models.forEach((m) => console.log(\`\${m.id}: \${m.description}\`));`,
        },
    ],
    "get /audio/models": [
        {
            label: "cURL",
            lang: "Shell",
            source: `curl https://gen.pollinations.ai/audio/models`,
        },
        {
            label: "JavaScript",
            lang: "JavaScript",
            source: `const response = await fetch("https://gen.pollinations.ai/audio/models");
const models = await response.json();
models.forEach((m) => console.log(\`\${m.id}: \${m.description}\`));`,
        },
    ],
    "get /account/usage": [
        {
            label: "cURL",
            lang: "Shell",
            source: `# Get usage history (JSON)
curl "https://gen.pollinations.ai/account/usage?limit=10" \\
  -H "Authorization: Bearer YOUR_API_KEY"

# Export the latest 50,000 rows from the last 30 days as CSV
curl "https://gen.pollinations.ai/account/usage?format=csv&days=30&limit=50000" \\
  -H "Authorization: Bearer YOUR_API_KEY" -o usage.csv`,
        },
        {
            label: "Python",
            lang: "Python",
            source: `import requests

response = requests.get(
    "https://gen.pollinations.ai/account/usage",
    params={"limit": 10, "days": 30},
    headers={"Authorization": "Bearer YOUR_API_KEY"},
)
for record in response.json()["usage"]:
    print(f"{record['model']}: {record['cost_usd']} pollen")`,
        },
    ],
    "get /account/usage/daily": [
        {
            label: "cURL",
            lang: "Shell",
            source: `curl "https://gen.pollinations.ai/account/usage/daily?days=30" \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
        },
    ],
};

// ---------------------------------------------------------------------------
// Response examples injected into the OpenAPI schema
// ---------------------------------------------------------------------------
export const RESPONSE_EXAMPLES: Record<string, unknown> = {
    "post /v1/chat/completions": {
        id: "chatcmpl-abc123",
        object: "chat.completion",
        created: 1700000000,
        model: "openai",
        choices: [
            {
                index: 0,
                message: {
                    role: "assistant",
                    content: "Hello! How can I help you today?",
                },
                finish_reason: "stop",
            },
        ],
        usage: {
            prompt_tokens: 10,
            completion_tokens: 12,
            total_tokens: 22,
        },
    },
    "get /v1/models": {
        object: "list",
        data: [
            {
                id: "openai",
                object: "model",
                created: 1700000000,
                owned_by: "pollinations",
            },
            {
                id: "claude",
                object: "model",
                created: 1700000000,
                owned_by: "pollinations",
            },
            {
                id: "gemini",
                object: "model",
                created: 1700000000,
                owned_by: "pollinations",
            },
        ],
    },
    "get /account/balance": {
        balance: 42.5,
    },
    "get /account/profile": {
        githubUsername: "janedeveloper",
        image: "https://avatars.example.com/jane.jpg",
        name: "Jane Developer",
        email: "jane@example.com",
    },
    "get /account/key": {
        valid: true,
        type: "secret",
        name: "my-bot",
        expiresAt: null,
        expiresIn: null,
        permissions: {
            models: null,
            account: ["usage"],
        },
        pollenBudget: null,
        rateLimitEnabled: false,
    },
};
