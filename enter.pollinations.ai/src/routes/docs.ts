import { Scalar } from "@scalar/hono-api-reference";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import { Hono } from "hono";
import { openAPIRouteHandler } from "hono-openapi";
import type { Env } from "@/env.ts";
import BYOP_MD from "../../../BRING_YOUR_OWN_POLLEN.md?raw";

const BYOP_DOCS = BYOP_MD.trim();

// Get all model aliases (values we want to hide from docs)
const IMAGE_ALIASES: Set<string> = new Set(
	Object.values(IMAGE_SERVICES).flatMap((service) => service.aliases),
);
const TEXT_ALIASES: Set<string> = new Set(
	Object.values(TEXT_SERVICES).flatMap((service) => service.aliases),
);
const ALL_ALIASES: Set<string> = new Set([...IMAGE_ALIASES, ...TEXT_ALIASES]);

function filterAliases(
	schema: Record<string, unknown>,
): Record<string, unknown> {
	return JSON.parse(
		JSON.stringify(schema, (key, value) => {
			if (key === "enum" && Array.isArray(value)) {
				const filtered = value.filter((v) => !ALL_ALIASES.has(v));
				return filtered.length !== value.length ? filtered : value;
			}
			return value;
		}),
	);
}

// ---------------------------------------------------------------------------
// x-codeSamples: multi-language examples injected into the OpenAPI schema
// ---------------------------------------------------------------------------
const CODE_SAMPLES: Record<
	string,
	{ label: string; lang: string; source: string }[]
> = {
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
    base_url="https://gen.pollinations.ai",
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
  baseURL: "https://gen.pollinations.ai",
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
	"get /audio/{text}": [
		{
			label: "cURL",
			lang: "Shell",
			source: `# Text-to-speech
curl "https://gen.pollinations.ai/audio/Hello%20world?voice=nova" \\
  -H "Authorization: Bearer YOUR_API_KEY" -o speech.mp3

# Generate music
curl "https://gen.pollinations.ai/audio/upbeat%20jazz?model=elevenmusic&duration=30" \\
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
    base_url="https://gen.pollinations.ai",
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
  baseURL: "https://gen.pollinations.ai",
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
    base_url="https://gen.pollinations.ai",
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
  baseURL: "https://gen.pollinations.ai",
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
};

// ---------------------------------------------------------------------------
// Schema transformation
// ---------------------------------------------------------------------------

// Transform OpenAPI schema for gen.pollinations.ai:
// 1. Remove /generate/ prefix from paths
// 2. Filter out model aliases from enums
// 3. Inject x-codeSamples for key endpoints
function transformOpenAPISchema(
	schema: Record<string, unknown>,
): Record<string, unknown> {
	const paths = schema.paths as Record<string, unknown> | undefined;
	if (!paths) return schema;

	const newPaths: Record<string, unknown> = {};

	for (const [path, value] of Object.entries(paths)) {
		const cleanPath = path.replace(/^\/generate/, "");
		newPaths[cleanPath] = value;

		// Inject x-codeSamples based on path + method
		if (value && typeof value === "object") {
			for (const [method, operation] of Object.entries(
				value as Record<string, unknown>,
			)) {
				if (operation && typeof operation === "object") {
					const normalizedPath = cleanPath
						.replace(/:(\w+)\{[^}]*\}/g, "{$1}")
						.replace(/:(\w+)/g, "{$1}");
					const key = `${method} ${normalizedPath}`;
					const samples = CODE_SAMPLES[key];
					if (samples) {
						(operation as Record<string, unknown>)["x-codeSamples"] =
							samples;
					}
				}
			}
		}
	}

	return filterAliases({
		...schema,
		paths: newPaths,
	});
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const createDocsRoutes = (apiRouter: Hono<Env>) => {
	return new Hono<Env>()
		.get("/", (c, next) =>
			Scalar<Env>({
				pageTitle: "Pollinations API Reference",
				title: "Pollinations API Reference",
				theme: "saturn",
				sources: [
					{ url: "/api/docs/open-api/generate-schema", title: "API" },
					...(c.env.ENVIRONMENT === "development"
						? [
								{
									url: "/api/auth/open-api/generate-schema",
									title: "Auth",
								},
							]
						: []),
				],
				authentication: {
					preferredSecurityScheme: "bearerAuth",
					securitySchemes: {
						bearerAuth: {
							token: "",
						},
					},
				},
			})(c, next),
		)
		.get("/open-api/generate-schema", async (c, next) => {
			const handler = openAPIRouteHandler(apiRouter, {
				documentation: {
					servers: [{ url: "https://gen.pollinations.ai" }],
					info: {
						title: "Pollinations API",
						version: "0.3.0",
						description: [
							"## Introduction",
							"",
							"Generate text, images, video, and audio with a single API. OpenAI-compatible — use any OpenAI SDK by changing the base URL.",
							"",
							"**Base URL:** `https://gen.pollinations.ai`",
							"",
							"**Get your API key:** [enter.pollinations.ai](https://enter.pollinations.ai)",
							"",
							"## Quick Start",
							"",
							"### Generate an Image",
							"",
							"Paste this URL in your browser — no code needed:",
							"",
							"```",
							"https://gen.pollinations.ai/image/a%20cat%20in%20space",
							"```",
							"",
							"Or use it directly in HTML:",
							"",
							"```html",
							'<img src="https://gen.pollinations.ai/image/a%20cat%20in%20space" />',
							"```",
							"",
							"### Generate Text (OpenAI-compatible)",
							"",
							"```bash",
							"curl https://gen.pollinations.ai/v1/chat/completions \\",
							'  -H "Authorization: Bearer YOUR_API_KEY" \\',
							'  -H "Content-Type: application/json" \\',
							'  -d \'{"model": "openai", "messages": [{"role": "user", "content": "Hello!"}]}\'',
							"```",
							"",
							"### Generate Speech",
							"",
							"```bash",
							'curl "https://gen.pollinations.ai/audio/Hello%20world?voice=nova" \\',
							'  -H "Authorization: Bearer YOUR_API_KEY" -o speech.mp3',
							"```",
							"",
							"## Authentication",
							"",
							"All generation requests require an API key from [enter.pollinations.ai](https://enter.pollinations.ai). Model listing endpoints work without authentication.",
							"",
							"**Two key types:**",
							"",
							"| Type | Prefix | Use case | Rate limits |",
							"|------|--------|----------|-------------|",
							"| Secret | `sk_` | Server-side apps | None |",
							"| Publishable | `pk_` | Client-side apps (beta) | 1 pollen/IP/hour |",
							"",
							"**How to authenticate:**",
							"",
							"```bash",
							"# Option 1: Authorization header (recommended)",
							'curl -H "Authorization: Bearer YOUR_API_KEY" ...',
							"",
							"# Option 2: Query parameter",
							'curl "https://gen.pollinations.ai/text/hello?key=YOUR_API_KEY"',
							"```",
							"",
							"> **Warning:** Never expose secret keys (`sk_`) in client-side code. Use publishable keys (`pk_`) for frontend apps.",
							"",
							"## Errors",
							"",
							"All errors return JSON with a consistent format:",
							"",
							"```json",
							"{",
							'  "status": 400,',
							'  "success": false,',
							'  "error": {',
							'    "code": "BAD_REQUEST",',
							'    "message": "Description of what went wrong"',
							"  }",
							"}",
							"```",
							"",
							"| Status | Meaning |",
							"|--------|---------|",
							"| `400` | Invalid parameters or malformed request |",
							"| `401` | Missing or invalid API key |",
							"| `402` | Insufficient pollen balance |",
							"| `403` | API key lacks required permission |",
							"| `500` | Internal server error |",
						].join("\n"),
					},
					components: {
						securitySchemes: {
							bearerAuth: {
								type: "http",
								scheme: "bearer",
								bearerFormat: "API Key",
								description:
									"API key from [enter.pollinations.ai](https://enter.pollinations.ai)",
							},
						},
					},
					security: [{ bearerAuth: [] }],
					tags: [
						{
							name: "Text Generation",
							description:
								"Generate text responses using AI models. Supports the OpenAI Chat Completions format — use any OpenAI SDK by changing the base URL to `https://gen.pollinations.ai`.",
						},
						{
							name: "Image Generation",
							description:
								"Generate images from text prompts. Supports models like Flux, GPT Image, Seedream, Kontext, and more.",
						},
						{
							name: "Video Generation",
							description: [
								"Generate videos from text prompts or reference images.",
								"",
								"Video generation uses the `/image/{prompt}` endpoint with video-specific models.",
								"Set the `model` parameter to a video model (`veo`, `seedance`, `wan`, `ltx-2`) and use video-specific parameters like `duration`, `aspectRatio`, and `audio`.",
							].join("\n"),
						},
						{
							name: "Audio",
							description:
								"Text-to-speech, music generation, and audio transcription. Both simple URL-based and OpenAI-compatible endpoints available.",
						},
						{
							name: "Models",
							description:
								"Discover available models with pricing, capabilities, and metadata.",
						},
						{
							name: "Account",
							description:
								"Manage your account, check your pollen balance, and view usage history.",
						},
						{
							name: "Bring Your Own Pollen 🌸",
							description: BYOP_DOCS,
						},
					],
				},
			});

			const response = await handler(c, next);
			if (!response) return;

			const schema = (await response.json()) as Record<string, unknown>;
			const transformed = transformOpenAPISchema(schema);
			return c.json(transformed);
		});
};
