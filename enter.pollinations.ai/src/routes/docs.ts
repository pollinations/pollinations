import { Scalar } from "@scalar/hono-api-reference";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import { AUDIO_SERVICES, ELEVENLABS_VOICES } from "@shared/registry/audio.ts";
import type { ServiceDefinition } from "@shared/registry/registry.ts";
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
// LLM-optimized documentation generator
// ---------------------------------------------------------------------------

function generateLLMDoc(): string {
	const lines: string[] = [];

	lines.push("# Pollinations API");
	lines.push("");
	lines.push(
		"> Generate text, images, video, and audio with a single API. OpenAI-compatible — use any OpenAI SDK by changing the base URL.",
	);
	lines.push("");
	lines.push("Base URL: https://gen.pollinations.ai");
	lines.push("API Keys: https://enter.pollinations.ai");
	lines.push("Docs: https://gen.pollinations.ai/api/docs");
	lines.push("");

	// Quick Start
	lines.push("## Quick Start");
	lines.push("");
	lines.push("### Text (Python, OpenAI SDK)");
	lines.push("");
	lines.push("```python");
	lines.push("from openai import OpenAI");
	lines.push(
		'client = OpenAI(base_url="https://gen.pollinations.ai", api_key="YOUR_API_KEY")',
	);
	lines.push(
		'response = client.chat.completions.create(model="openai", messages=[{"role": "user", "content": "Hello!"}])',
	);
	lines.push("print(response.choices[0].message.content)");
	lines.push("```");
	lines.push("");
	lines.push("### Image (URL — no code needed)");
	lines.push("");
	lines.push("```");
	lines.push(
		"https://gen.pollinations.ai/image/a%20cat%20in%20space?model=flux",
	);
	lines.push("```");
	lines.push("");
	lines.push("### Audio (cURL)");
	lines.push("");
	lines.push("```bash");
	lines.push(
		'curl "https://gen.pollinations.ai/audio/Hello%20world?voice=nova" \\',
	);
	lines.push('  -H "Authorization: Bearer YOUR_API_KEY" -o speech.mp3');
	lines.push("```");
	lines.push("");

	// Auth
	lines.push("## Authentication");
	lines.push("");
	lines.push(
		"All generation requests require an API key. Model listing endpoints work without auth.",
	);
	lines.push("");
	lines.push("- Header: `Authorization: Bearer YOUR_API_KEY`");
	lines.push("- Query param: `?key=YOUR_API_KEY`");
	lines.push("");
	lines.push(
		"Key types: `sk_` (secret, server-side) | `pk_` (publishable, client-side, rate limited)",
	);
	lines.push("");

	// Endpoints
	lines.push("## Endpoints");
	lines.push("");

	lines.push("### POST /v1/chat/completions");
	lines.push(
		'OpenAI-compatible chat completions. Use any OpenAI SDK with base_url="https://gen.pollinations.ai".',
	);
	lines.push("");
	lines.push("Request body (JSON):");
	lines.push('- model (string, default: "openai"): Model ID');
	lines.push(
		"- messages (array, required): [{role: \"user\"|\"assistant\"|\"system\", content: \"...\"}]",
	);
	lines.push("- stream (boolean, default: false): SSE streaming");
	lines.push("- temperature (number, 0.0-2.0): Randomness");
	lines.push(
		"- seed (integer, default: 0): Reproducibility. -1 for random",
	);
	lines.push(
		'- response_format ({type: "json_object"}): Force JSON output',
	);
	lines.push("");

	lines.push("### GET /text/{prompt}");
	lines.push("Simple text generation. Returns plain text.");
	lines.push(
		"Query params: model, seed, system, json, temperature, stream",
	);
	lines.push("");

	lines.push("### GET /image/{prompt}");
	lines.push(
		"Generate image or video. Returns binary (image/jpeg or video/mp4).",
	);
	lines.push("");
	lines.push("Query params:");
	lines.push('- model (string, default: "flux"): Image or video model');
	lines.push("- width (int, default: 1024), height (int, default: 1024)");
	lines.push(
		"- seed (int, default: 0): Works with flux, zimage, seedream, klein, seedance. -1 for random",
	);
	lines.push("- enhance (boolean, default: false): AI prompt enhancement");
	lines.push("- negative_prompt (string): Only flux, zimage");
	lines.push("- safe (boolean, default: false): Safety filter");
	lines.push('- quality (low|medium|high|hd, default: "medium"): Only gptimage');
	lines.push(
		"- image (string): Reference image URL(s), | or , separated",
	);
	lines.push("- transparent (boolean, default: false): Only gptimage");
	lines.push("- duration (int, 1-10): Video duration in seconds");
	lines.push('- aspectRatio ("16:9"|"9:16"): Video only');
	lines.push(
		"- audio (boolean, default: false): Video audio. wan/ltx-2 always have audio",
	);
	lines.push("");

	lines.push("### GET /audio/{text}");
	lines.push("Text-to-speech or music generation. Returns audio/mpeg.");
	lines.push(
		"Query params: voice, model (elevenlabs|elevenmusic), duration",
	);
	lines.push("");

	lines.push("### POST /v1/audio/speech");
	lines.push("OpenAI-compatible TTS. Body: {input, voice, model}");
	lines.push("");

	lines.push("### POST /v1/audio/transcriptions");
	lines.push(
		"Speech-to-text. Multipart: file (audio), model (whisper-large-v3|scribe_v2)",
	);
	lines.push("");

	lines.push("### GET /v1/models");
	lines.push("List text models (OpenAI format). No auth required.");
	lines.push("");

	lines.push("### GET /image/models");
	lines.push("List image/video models with metadata. No auth required.");
	lines.push("");

	// Models
	lines.push("## Text Models");
	lines.push("");
	for (const [id, rawSvc] of Object.entries(TEXT_SERVICES)) {
		const svc = rawSvc as ServiceDefinition<string>;
		if (svc.hidden) continue;
		const caps: string[] = [];
		if (svc.tools) caps.push("tools");
		if (svc.reasoning) caps.push("reasoning");
		if (svc.search) caps.push("search");
		if (svc.codeExecution) caps.push("code-exec");
		const capsStr = caps.length ? ` [${caps.join(", ")}]` : "";
		const flags: string[] = [];
		if (svc.alpha) flags.push("alpha");
		if (svc.paidOnly) flags.push("paid");
		const flagStr = flags.length ? ` (${flags.join(", ")})` : "";
		lines.push(
			`- ${id}: ${svc.description ?? id}${capsStr}${flagStr}`,
		);
	}
	lines.push("");

	lines.push("## Image Models");
	lines.push("");
	for (const [id, rawSvc] of Object.entries(IMAGE_SERVICES)) {
		const svc = rawSvc as ServiceDefinition<string>;
		if (svc.hidden) continue;
		if (svc.outputModalities?.includes("video")) continue;
		const flags: string[] = [];
		if (svc.paidOnly) flags.push("paid");
		if (svc.inputModalities?.includes("image")) flags.push("image input");
		const flagStr = flags.length ? ` (${flags.join(", ")})` : "";
		lines.push(
			`- ${id}: ${svc.description ?? id}${flagStr}`,
		);
	}
	lines.push("");

	lines.push("## Video Models");
	lines.push("");
	for (const [id, rawSvc] of Object.entries(IMAGE_SERVICES)) {
		const svc = rawSvc as ServiceDefinition<string>;
		if (svc.hidden) continue;
		if (!svc.outputModalities?.includes("video")) continue;
		const flags: string[] = [];
		if (svc.paidOnly) flags.push("paid");
		const flagStr = flags.length ? ` (${flags.join(", ")})` : "";
		lines.push(
			`- ${id}: ${svc.description ?? id}${flagStr}`,
		);
	}
	lines.push("");

	lines.push("## Audio Models");
	lines.push("");
	for (const [id, rawSvc] of Object.entries(AUDIO_SERVICES)) {
		const svc = rawSvc as ServiceDefinition<string>;
		if (svc.hidden) continue;
		const flags: string[] = [];
		if (svc.alpha) flags.push("alpha");
		const flagStr = flags.length ? ` (${flags.join(", ")})` : "";
		lines.push(
			`- ${id}: ${svc.description ?? id}${flagStr}`,
		);
	}
	lines.push("");

	lines.push("## Available Voices (TTS)");
	lines.push("");
	lines.push(ELEVENLABS_VOICES.join(", "));
	lines.push("");

	// Errors
	lines.push("## Errors");
	lines.push("");
	lines.push("JSON: {status, success: false, error: {code, message}}");
	lines.push("- 400: Invalid parameters");
	lines.push("- 401: Missing/invalid API key");
	lines.push("- 402: Insufficient balance");
	lines.push("- 403: Permission denied");
	lines.push("- 500: Server error");

	return lines.join("\n");
}

const LLM_DOC_TEXT = generateLLMDoc();

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
// "Copy for LLMs" button injected into the Scalar docs page
// ---------------------------------------------------------------------------

const LLM_BUTTON_HTML = `
<style>
.llm-btn {
  position: fixed; bottom: 20px; right: 20px; z-index: 10000;
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px;
  background: var(--scalar-background-2, #1a1a2e);
  color: var(--scalar-color-1, #e0e0e0);
  border: 1px solid var(--scalar-border-color, #333);
  border-radius: 8px; font-size: 13px;
  font-family: var(--scalar-font, system-ui, sans-serif);
  cursor: pointer; transition: all .15s ease;
  box-shadow: 0 2px 8px rgba(0,0,0,.2);
}
.llm-btn:hover {
  border-color: var(--scalar-color-accent, #6366f1);
  box-shadow: 0 2px 12px rgba(99,102,241,.3);
}
.llm-btn svg {
  width: 16px; height: 16px; fill: none;
  stroke: currentColor; stroke-width: 2;
}
.llm-toast {
  position: fixed; bottom: 68px; right: 20px; z-index: 10001;
  padding: 8px 16px;
  background: var(--scalar-color-accent, #6366f1); color: #fff;
  border-radius: 8px; font-size: 13px;
  font-family: var(--scalar-font, system-ui, sans-serif);
  opacity: 0; transform: translateY(8px);
  transition: all .2s ease; pointer-events: none;
}
.llm-toast.show { opacity: 1; transform: translateY(0); }
</style>
<div class="llm-toast" id="llm-toast">Copied to clipboard!</div>
<button class="llm-btn" id="llm-btn" title="Copy API docs optimized for AI assistants">
  <svg viewBox="0 0 24 24"><path d="M12 2L9.5 8.5 2 12l7.5 3.5L12 22l2.5-6.5L22 12l-7.5-3.5z"/></svg>
  Copy for LLMs
</button>
<script>
(function() {
  var NS = 'http://www.w3.org/2000/svg';
  function makeSvg(d, tag) {
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    var el = document.createElementNS(NS, tag || 'path');
    if (tag === 'polyline') el.setAttribute('points', d);
    else el.setAttribute('d', d);
    svg.appendChild(el);
    return svg;
  }
  function setBtn(btn, svgData, svgTag, label) {
    while (btn.firstChild) btn.removeChild(btn.firstChild);
    btn.appendChild(makeSvg(svgData, svgTag));
    btn.appendChild(document.createTextNode(' ' + label));
  }
  var STAR = 'M12 2L9.5 8.5 2 12l7.5 3.5L12 22l2.5-6.5L22 12l-7.5-3.5z';
  var CHECK = '20 6 9 17 4 12';
  var btn = document.getElementById('llm-btn');
  var toast = document.getElementById('llm-toast');
  btn.addEventListener('click', async function() {
    btn.disabled = true; btn.style.opacity = '.7';
    try {
      var res = await fetch('/api/docs/llm.txt');
      if (!res.ok) throw new Error('Failed to fetch');
      var text = await res.text();
      await navigator.clipboard.writeText(text);
      toast.classList.add('show');
      setBtn(btn, CHECK, 'polyline', 'Copied!');
      setTimeout(function() {
        toast.classList.remove('show');
        setBtn(btn, STAR, 'path', 'Copy for LLMs');
        btn.disabled = false; btn.style.opacity = '1';
      }, 2000);
    } catch(e) {
      window.open('/api/docs/llm.txt', '_blank');
      btn.disabled = false; btn.style.opacity = '1';
    }
  });
})();
</script>`;

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
		.get("/", async (c, next) => {
			const response = await Scalar<Env>({
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
			})(c, next);
			if (!response) return;
			const html = await response.text();
			const lastBodyIdx = html.lastIndexOf("</body>");
			if (lastBodyIdx === -1) return c.html(html);
			return c.html(
				html.slice(0, lastBodyIdx) +
					LLM_BUTTON_HTML +
					html.slice(lastBodyIdx),
			);
		})
		.get("/llm.txt", (c) => {
			c.header("Cache-Control", "public, max-age=3600");
			return c.text(LLM_DOC_TEXT);
		})
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
