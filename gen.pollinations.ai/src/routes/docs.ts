import { Scalar } from "@scalar/hono-api-reference";
import { AUDIO_SERVICES, ELEVENLABS_VOICES } from "@shared/registry/audio.ts";
import { EMBEDDING_SERVICES } from "@shared/registry/embeddings.ts";
import {
    getImageModelIds,
    getVideoModelIds,
    IMAGE_SERVICES,
} from "@shared/registry/image.ts";
import { getRealtimeModelsInfo } from "@shared/registry/model-info.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import type { Context } from "hono";
import { Hono } from "hono";
import { generateSpecs } from "hono-openapi";
import { marked } from "marked";
import { stringify as yamlStringify } from "yaml";
import type { Env } from "@/env.ts";
import LOGO_WHITE_SVG from "../../../assets/logo-text-white.svg?raw";
import { CODE_SAMPLES, RESPONSE_EXAMPLES } from "./docs-samples.ts";
import {
    API_REFERENCE_CUSTOM_CSS,
    GUIDES_CSS,
    POLLINATIONS_HEADER_CSS,
    POLLINATIONS_HEADER_SCALAR_CSS,
    POLLINATIONS_HEADER_STANDALONE_CSS,
} from "./docs-styles.ts";
import { docsSocialHeadTags, injectDocsSocialHead, SEO_TITLE } from "./seo.ts";

// Same favicon as enter.pollinations.ai. Scalar needs this as a data URI, while
// conventional browser/favicon URLs are served from gen.pollinations.ai/public.
const FAVICON_DATA_URI =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAAE9ElEQVR4nMVXaWhdVRB+7gsWNxQVQVxQEYsbIqhFsEjd/WGVWtHiTltccS1Yan9ocK1VqRoVqkUkFRUFUawWUxWVNG/m5ZlgXNLcmZtaWmuKJnkzTz0y55z78raQpYsDFx73nDvznTnffDMvl9sOWz/Uf9T64YFjcv+HrXVuTxT+FpV++MYl++1yACD0JAj9hsopKr2+ywJ3uI69UGgpCEte+Foo8+UorCC8rM/17bvTAYAmd6JQGYRuyN5hia8E4RFUWrRTg3dqcjYI/QPKrQ3AhFtQ2WGZZ25XEBB6EZRfqX5QaAWUk1kovBaUsc25Peq/c87tDkJfGzEL5fQiEHqh0Q+/3Ot69xkPwL+o9CsIfZY9xnR/OmVnjsf6FoUfr+xT/qnWB/fa+x63edq4AEB5cd3pdkOhx0ZBcEtDcKVFVevL6k+KSvfYWtFtOmDSAMxAqB2FB1DoqXDXdMkoMdPz/Tvh5f7kypirs8kCeLTJ+3ZUZnMAym2g1N/h0v29ICn9CMIfd7hfDgSlHlAujAVgzCvocZunQYlP9BwQXt7hNhzZBEBqvwsj/ceZDhQkuT5fpsusMjpLA6eEbFB3PYCi6zsChZ+I13NG3vUdNOp4ZOOxqOmDPr3xDkM6qQzKq0HpLvvA1A6Fh03/AyD+EpQ+AKU3jKT2zu8THkTld2Om5oPS2yBcqvO9DYWWdI30H5/zUiq0zdhd0IGzUGkDKL8Kkt6CQp/GDzZlJLQTRwBzPMOV21CSW0Oa0xmRC3Zajr+/8ECEnwXh3y1GkHHeamBzKHQbCg11Oz7UOxFah0IfZRkylCj8SVUZrvEAysnF1gtAKcESzQ4A+L2qfe12LVZBcW0lKhftt3EFhTaj8gPh7sO9tdrmILU8CG7j4TUcKCezQOhPnwXhmwxAJaUlmg0lutoTOPaILHBNQKElMXvPWaYLrv/g4LzEVxiRLJVFlxwCQltM/RoqoUwXGg8MSF7pjgxAQel2C2DBsZRe1VSghIeNjAXhayIZb64rE15oZLE7Rkmvi2q2uDkIGgrNp0Kqv/zJIz9q/dLd0dd86xP+u5iJBgPlVbYBlO/zrA93+VJDSSrfX8PqAGJp9R7jVCCel/bXPAChISN20+CZodK9fqNyFyp1RiYPWqMBpYcLSg9VOl8tgGdsLaxTuzE+nJy6rRLizNAybi8wQ0nPROHPG4JM9RFa16V8bm6yhpJMR+UFqPwWKHXYY85idzMilexkWZBQ83Gf0jt2/6Z8uR1pEEYwU7suUzzrAX44DUSck9vRlre5T/nnqFx/REZDpxs4DJXfRKUPowR/N8oX3mrNKlPIKRtKMheF/kbh763f+3rXdEbW6zMA2bBq92x7jIgo9FWoAF4wteBDdHQsydXNRrAIYGUGoN6CqvIqy4pvOpMGIEGMiiPJCc3WbQ4ApfeNeGON4/Ga3KSzUCilJ0ctcDZsVDS7ykDpkaoye7p+3f4tZbwwmc8Lnz5hAKhctMEUhed5dteN4V1Cp8XJqRWFnw/9ILmgxoeNbqFv3BiaHSWTAEB91pJt+LAKsJquXs9rel44eTLXl2XVnFAFYAUok3HJdMT3/gkDEJ7n/4AYCYW2gNI51etFV9zbyGdTU5BYWmPzYfUekOTUMMj4LFg1LJwwAA+izDNDm02mN1s3ENZSrdbrg1d8lPgkX5ZlunSsQP8BPbyNNiarxF0AAAAASUVORK5CYII=";

import BYOP_MD from "../../../BRING_YOUR_OWN_POLLEN.md?raw";
import MCP_README from "../../../packages/mcp/README.md?raw";
import CLI_README from "../../../packages/polli-cli/README.md?raw";
import ACCOUNT_MD from "../docs/account.md?raw";
import AUDIO_GENERATION_MD from "../docs/audio-generation.md?raw";
import AUTHENTICATION_MD from "../docs/authentication.md?raw";
import EMBEDDINGS_MD from "../docs/embeddings.md?raw";
import ERRORS_MD from "../docs/errors.md?raw";
import IMAGE_GENERATION_MD from "../docs/image-generation.md?raw";
import INTRODUCTION_MD from "../docs/introduction.md?raw";
import MEDIA_STORAGE_MD from "../docs/media-storage.md?raw";
import MODELS_MD from "../docs/models.md?raw";
import PUBLIC_STATS_MD from "../docs/public-stats.md?raw";
import QUICK_START_MD from "../docs/quick-start.md?raw";
import SAFETY_MD from "../docs/safety.md?raw";
import TEXT_GENERATION_MD from "../docs/text-generation.md?raw";
import VIDEO_GENERATION_MD from "../docs/video-generation.md?raw";

type OpenApiSchema = Record<string, unknown>;

const DOC_TAGS = {
    quickStart: "Quick Start",
    authentication: "Authentication",
    byop: "BYOP",
    cli: "CLI",
    mcpServer: "MCP Server",
    errors: "Errors",
    safety: "Safety",
    text: "Text",
    image: "Image",
    video: "Video",
    realtime: "Realtime",
    audio: "Audio",
    embeddings: "Embeddings",
    models: "Models",
    quests: "Quests",
    mediaStorage: "Media Storage",
    account: "Account",
    publicStats: "Public Stats",
} as const;

const LEGACY_DOC_TAGS: Record<string, string> = {
    "🚀 Quick Start": DOC_TAGS.quickStart,
    "🔐 Authentication": DOC_TAGS.authentication,
    "🌸 BYOP": DOC_TAGS.byop,
    "🖥 CLI": DOC_TAGS.cli,
    "🔌 MCP Server": DOC_TAGS.mcpServer,
    "❌ Errors": DOC_TAGS.errors,
    "🛡️ Safety": DOC_TAGS.safety,
    "✍️ Text": DOC_TAGS.text,
    "🖼️ Image": DOC_TAGS.image,
    "🎬 Video": DOC_TAGS.video,
    "🎙️ Realtime": DOC_TAGS.realtime,
    "🔊 Audio": DOC_TAGS.audio,
    "🔢 Embeddings": DOC_TAGS.embeddings,
    "🤖 Models": DOC_TAGS.models,
    "✨ Quests": DOC_TAGS.quests,
    "📦 Media Storage": DOC_TAGS.mediaStorage,
    "👤 Account": DOC_TAGS.account,
    "📊 Public Stats": DOC_TAGS.publicStats,
    "media.pollinations.ai": DOC_TAGS.mediaStorage,
};

const docsIcon = (body: string): string =>
    `<svg class="ph-doc-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const DOC_TAG_ICON_HTML: Record<string, string> = {
    [DOC_TAGS.quickStart]: docsIcon(
        '<path d="M7 20h10" /><path d="M10 20c5.5-2.5.8-6.4 3-10" /><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z" /><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z" />',
    ),
    [DOC_TAGS.authentication]: docsIcon(
        '<rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />',
    ),
    [DOC_TAGS.byop]: docsIcon(
        '<path d="M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v2H5a2 2 0 0 0-2 2V7Z" /><path d="M3 11a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6Z" /><circle cx="17" cy="14" r="1.25" fill="currentColor" />',
    ),
    [DOC_TAGS.cli]: docsIcon(
        '<polyline points="4 8 8 12 4 16" /><line x1="12" y1="20" x2="20" y2="20" />',
    ),
    [DOC_TAGS.mcpServer]: docsIcon(
        '<rect x="2" y="7" width="8" height="10" rx="1.5" /><rect x="14" y="7" width="8" height="10" rx="1.5" /><path d="M10 12h4" />',
    ),
    [DOC_TAGS.errors]: docsIcon('<path d="M18 6 6 18M6 6l12 12" />'),
    [DOC_TAGS.safety]: docsIcon('<polyline points="20 6 9 17 4 12" />'),
    [DOC_TAGS.text]: docsIcon(
        '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />',
    ),
    [DOC_TAGS.image]: docsIcon(
        '<rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" />',
    ),
    [DOC_TAGS.video]: docsIcon(
        '<path d="m22 8-6 4 6 4V8z" /><rect x="2" y="6" width="14" height="12" rx="2" />',
    ),
    [DOC_TAGS.realtime]: docsIcon(
        '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><path d="M12 19v3" />',
    ),
    [DOC_TAGS.audio]: docsIcon(
        '<path d="M11 5 6 9H2v6h4l5 4z" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" />',
    ),
    [DOC_TAGS.embeddings]: docsIcon(
        '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />',
    ),
    [DOC_TAGS.models]: docsIcon(
        '<path d="M9 3h6" /><path d="M10 3v6.5L4.5 18a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 9.5V3" /><path d="M7 14h10" />',
    ),
    [DOC_TAGS.quests]: docsIcon(
        '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z" /><path d="M20 3v4" /><path d="M22 5h-4" /><path d="M4 17v2" /><path d="M5 18H3" />',
    ),
    [DOC_TAGS.mediaStorage]: docsIcon(
        '<ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14a9 3 0 0 0 18 0V5" /><path d="M3 12a9 3 0 0 0 18 0" />',
    ),
    [DOC_TAGS.account]: docsIcon(
        '<circle cx="7.5" cy="15.5" r="5.5" /><path d="m21 2-9.6 9.6" /><path d="m15.5 7.5 3 3L22 7l-3-3" />',
    ),
    [DOC_TAGS.publicStats]: docsIcon(
        '<polyline points="3 17 9 11 13 15 21 7" /><polyline points="15 7 21 7 21 13" />',
    ),
};

const DOC_TAG_NAV_ICON_HTML: Record<string, string> = Object.fromEntries(
    Object.entries(DOC_TAG_ICON_HTML).map(([tag, icon]) => [
        tag,
        icon.replace(
            'class="ph-doc-icon"',
            'class="ph-doc-icon ph-doc-nav-icon"',
        ),
    ]),
);

const BYOP_DOCS = BYOP_MD.trim();

const CLI_DOCS = CLI_README.replace(/^# .*\n+/, "")
    .replace(/^https:\/\/github\.com\/user-attachments\/assets\/[^\n]+\n+/m, "")
    .trim();

const MCP_DOCS = MCP_README.replace(/^# .*\n+/, "").trim();

// Strip the leading H1/H2 heading line so the markdown can be embedded under
// a Scalar tag (which already renders its own title) without double headings.
const stripLeadingHeading = (md: string) =>
    md.replace(/^#{1,2}\s.*\n+/, "").trim();

// Dynamic registry values get injected into the markdown via {{PLACEHOLDER}}
// substitution. The placeholders live in the .md files so the prose stays in
// markdown but the model lists update automatically as the registry changes.
const interpolate = (md: string, vars: Record<string, string>): string =>
    md.replace(/\{\{(\w+)\}\}/g, (m, key) => vars[key] ?? m);

const INTRODUCTION_DOCS = INTRODUCTION_MD.trim();
const QUICK_START_DOCS = QUICK_START_MD.trim();
const AUTHENTICATION_DOCS = AUTHENTICATION_MD.trim();
const MODELS_DOCS = MODELS_MD.trim();
const MEDIA_STORAGE_DOCS = MEDIA_STORAGE_MD.trim();
const ACCOUNT_DOCS = ACCOUNT_MD.trim();
const PUBLIC_STATS_DOCS = PUBLIC_STATS_MD.trim();
const SAFETY_DOCS = SAFETY_MD.trim();
const ERRORS_DOCS = ERRORS_MD.trim();
const IMAGE_ALIASES = new Set(
    Object.values(IMAGE_SERVICES).flatMap((service) => service.aliases),
);
const TEXT_ALIASES = new Set(
    Object.values(TEXT_SERVICES).flatMap((service) => service.aliases),
);
const AUDIO_ALIASES = new Set(
    Object.values(AUDIO_SERVICES).flatMap((service) => service.aliases),
);
const EMBEDDING_ALIASES = new Set(
    Object.values(EMBEDDING_SERVICES).flatMap((service) => service.aliases),
);
const ALL_ALIASES = new Set([
    ...IMAGE_ALIASES,
    ...TEXT_ALIASES,
    ...AUDIO_ALIASES,
    ...EMBEDDING_ALIASES,
]);
const UNDOCUMENTED_CHAT_COMPAT_FIELDS = ["thinking", "thinking_budget"];

const imageModelDisplayNames = getImageModelIds().join(", ");

const videoModelDisplayNames = getVideoModelIds().join(", ");

const textModelDisplayNames = Object.keys(TEXT_SERVICES).join(", ");
const audioModelDisplayNames = Object.keys(AUDIO_SERVICES).join(", ");
const embeddingModelDisplayNames = Object.keys(EMBEDDING_SERVICES).join(", ");
const realtimeModelDisplayNames = getRealtimeModelsInfo()
    .map((model) => model.name)
    .join(", ");

function filterAliases(schema: OpenApiSchema): OpenApiSchema {
    return JSON.parse(
        JSON.stringify(schema, (key, value) => {
            if (key === "enum" && Array.isArray(value)) {
                const filtered = value.filter(
                    (v) => typeof v !== "string" || !ALL_ALIASES.has(v),
                );
                return filtered.length !== value.length ? filtered : value;
            }
            return value;
        }),
    ) as OpenApiSchema;
}

function hideUndocumentedChatCompatFields(
    schema: OpenApiSchema,
): OpenApiSchema {
    return JSON.parse(
        JSON.stringify(schema, (_key, value) => {
            if (!value || typeof value !== "object" || Array.isArray(value)) {
                return value;
            }

            const record = value as Record<string, unknown>;
            const properties = record.properties;
            if (
                !properties ||
                typeof properties !== "object" ||
                Array.isArray(properties)
            ) {
                return value;
            }

            const props = properties as Record<string, unknown>;
            if (!("reasoning_effort" in props)) {
                return value;
            }

            const filtered = { ...props };
            for (const field of UNDOCUMENTED_CHAT_COMPAT_FIELDS) {
                delete filtered[field];
            }

            return { ...record, properties: filtered };
        }),
    ) as OpenApiSchema;
}

// Substitute live registry values into the section markdown.
const MODEL_VARS: Record<string, string> = {
    TEXT_MODELS: textModelDisplayNames,
    IMAGE_MODELS: imageModelDisplayNames,
    VIDEO_MODELS: videoModelDisplayNames,
    REALTIME_MODELS: realtimeModelDisplayNames,
    AUDIO_MODELS: audioModelDisplayNames,
    EMBEDDING_MODELS: embeddingModelDisplayNames,
    ELEVENLABS_VOICES: ELEVENLABS_VOICES.join(", "),
};

const TEXT_GENERATION_DOCS = interpolate(TEXT_GENERATION_MD.trim(), MODEL_VARS);
const IMAGE_GENERATION_DOCS = interpolate(
    IMAGE_GENERATION_MD.trim(),
    MODEL_VARS,
);
const VIDEO_GENERATION_DOCS = interpolate(
    VIDEO_GENERATION_MD.trim(),
    MODEL_VARS,
);
const AUDIO_GENERATION_DOCS = interpolate(
    AUDIO_GENERATION_MD.trim(),
    MODEL_VARS,
);
const REALTIME_DOCS = [
    "## Realtime Voice",
    "",
    "OpenAI-compatible Realtime WebSocket proxy for voice and multimodal sessions.",
    "",
    "| Endpoint | Description |",
    "|----------|-------------|",
    "| `GET /v1/realtime` | WebSocket Realtime session (`model=gpt-realtime-2`) |",
    "",
    "Requires an API key with positive balance. Server clients can use `Authorization: Bearer <key>`; browser WebSocket clients can use `?key=pk_...`.",
    "",
    "The WebSocket proxy aggregates observed `response.done` usage and settles one billing event when the session closes. Input transcription sessions are not supported yet.",
    "",
    "Events sent and received over the socket use the OpenAI Realtime protocol unchanged. See OpenAI's [Realtime WebSocket events guide](https://developers.openai.com/api/docs/guides/realtime-websocket#sending-and-receiving-events).",
    "",
    "```js",
    'import WebSocket from "ws";',
    "",
    "// Server: Bearer auth. Browser: append `&key=pk_...` instead (headers aren't settable).",
    "const ws = new WebSocket(",
    '    "wss://gen.pollinations.ai/v1/realtime?model=gpt-realtime-2",',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal JS snippet shown in docs
    "    { headers: { Authorization: `Bearer ${process.env.POLLINATIONS_API_KEY}` } },",
    ");",
    "",
    'ws.on("open", () => ws.send(JSON.stringify({',
    '    type: "session.update",',
    '    session: { type: "realtime", instructions: "Be concise." },',
    "})));",
    'ws.on("message", (m) => console.log(JSON.parse(m.toString())));',
    "```",
    "",
    "**Browser audio:** play the model's audio through an `<audio>` element (e.g. a Web Audio `MediaStreamDestination` set as the element's `srcObject`), not straight to the Web Audio output. The browser only uses audio-element output as the echo-cancellation reference, so without it the mic re-captures the model's voice and it starts replying to itself. The WebRTC transport handles this automatically; on the WebSocket transport it's the client's responsibility.",
    "",
    `**Realtime models:** ${realtimeModelDisplayNames}`,
].join("\n");
const EMBEDDINGS_DOCS = interpolate(EMBEDDINGS_MD.trim(), MODEL_VARS);

// Composition: the "api" section copy mirrors the Scalar API Reference page
// — intro + quick start + auth + all generation modalities + models + media
// storage + account + safety + errors. BYOP, CLI, MCP are separate guides.
const GEN_API_DOCS = [
    INTRODUCTION_DOCS,
    QUICK_START_DOCS,
    AUTHENTICATION_DOCS,
    TEXT_GENERATION_DOCS,
    IMAGE_GENERATION_DOCS,
    VIDEO_GENERATION_DOCS,
    REALTIME_DOCS,
    AUDIO_GENERATION_DOCS,
    EMBEDDINGS_DOCS,
    MODELS_DOCS,
    MEDIA_STORAGE_DOCS,
    ACCOUNT_DOCS,
    SAFETY_DOCS,
    ERRORS_DOCS,
    PUBLIC_STATS_DOCS,
].join("\n\n");

const BYOP_SECTION = `## BYOP\n\n${BYOP_DOCS}`;
const CLI_SECTION = `## CLI\n\n${CLI_DOCS}`;
const MCP_SECTION = `## MCP Server\n\n${MCP_DOCS}`;

const LLM_DOC_TEXT = [
    GEN_API_DOCS,
    BYOP_SECTION,
    CLI_SECTION,
    MCP_SECTION,
].join("\n\n");

const LLM_DOC_SECTIONS: Record<string, string> = {
    api: GEN_API_DOCS,
    byop: BYOP_SECTION,
    cli: CLI_SECTION,
    mcp: MCP_SECTION,
};

type GuideId = "byop" | "cli" | "mcp";

function pollinationsHeaderHtml(scalarHosted = false): string {
    const contextCss = scalarHosted
        ? POLLINATIONS_HEADER_SCALAR_CSS
        : POLLINATIONS_HEADER_STANDALONE_CSS;
    const navIcons = JSON.stringify(DOC_TAG_NAV_ICON_HTML);
    return `<style>${POLLINATIONS_HEADER_CSS}${contextCss}</style>
<header class="ph-bar">
  <a href="/" class="ph-brand"><img src="/docs/logo.svg" alt="Pollinations" /></a>
</header>
<div class="ph-fab-cluster">
  <button class="ph-fab ph-fab-copy" type="button">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
    <span>Copy for LLMs</span>
  </button>
</div>
<script>
(function () {
  // Copy for LLMs — always copies the full doc (api + integrations).
  var copy = document.querySelector('.ph-fab-copy');
  if (copy) {
    var label = copy.querySelector('span');
    copy.addEventListener('click', async function () {
      var res = await fetch('/docs/llm.txt');
      var text = await res.text();
      await navigator.clipboard.writeText(text);
      var prev = label.textContent;
      label.textContent = 'Copied';
      setTimeout(function () { label.textContent = prev; }, 1200);
    });
  }
  // Text-based DOM scan for Scalar buttons whose class names get hashed
  // by the CDN bundle — we tag them by their stable label so our CSS can
  // hide ("Ask AI") or style ("Show more") them in amber.
  var navIcons = ${navIcons};
  function normalizeScalarNavLabel(text) {
    return text.replace(/\\s+/g, ' ').trim().replace(/\\s*(Open|Close)\\s*Group$/i, '').trim();
  }
  function scanScalarButtons() {
    var nodes = document.querySelectorAll('button, a, [role="button"]');
    for (var i = 0; i < nodes.length; i++) {
      var text = (nodes[i].textContent || '').trim();
      var navText = normalizeScalarNavLabel(text);
      if (/^ask ai\\b/i.test(text)) nodes[i].style.display = 'none';
      else if (/^show more\\b/i.test(text)) nodes[i].classList.add('ph-show-more');
      else if (navIcons[navText] && !nodes[i].querySelector('.ph-doc-icon')) {
        nodes[i].classList.add('ph-doc-nav-item');
        nodes[i].insertAdjacentHTML('afterbegin', navIcons[navText]);
      }
    }
  }
  scanScalarButtons();
  new MutationObserver(scanScalarButtons).observe(document.body, { childList: true, subtree: true });
})();
</script>`;
}

function generationDocumentation(): OpenApiSchema {
    return {
        servers: [{ url: "https://gen.pollinations.ai" }],
        info: {
            title: "Pollinations API",
            version: "0.3.0",
            description: INTRODUCTION_DOCS,
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
        "x-tagGroups": [
            {
                name: "Get Started",
                tags: [DOC_TAGS.quickStart, DOC_TAGS.authentication],
            },
            {
                name: "Integrations",
                tags: [DOC_TAGS.byop, DOC_TAGS.cli, DOC_TAGS.mcpServer],
            },
            {
                name: "Generation",
                tags: [
                    DOC_TAGS.text,
                    DOC_TAGS.image,
                    DOC_TAGS.video,
                    DOC_TAGS.realtime,
                    DOC_TAGS.audio,
                    DOC_TAGS.embeddings,
                ],
            },
            {
                name: "Resources",
                tags: [
                    DOC_TAGS.models,
                    DOC_TAGS.quests,
                    DOC_TAGS.mediaStorage,
                    DOC_TAGS.account,
                    DOC_TAGS.safety,
                    DOC_TAGS.errors,
                    DOC_TAGS.publicStats,
                ],
            },
        ],
        tags: [
            {
                name: DOC_TAGS.quickStart,
                description: stripLeadingHeading(QUICK_START_DOCS),
            },
            {
                name: DOC_TAGS.authentication,
                description: stripLeadingHeading(AUTHENTICATION_DOCS),
            },
            {
                name: DOC_TAGS.byop,
                description: BYOP_DOCS,
            },
            {
                name: DOC_TAGS.cli,
                description: CLI_DOCS,
            },
            {
                name: DOC_TAGS.mcpServer,
                description: MCP_DOCS,
            },
            {
                name: DOC_TAGS.errors,
                description: stripLeadingHeading(ERRORS_DOCS),
            },
            {
                name: DOC_TAGS.safety,
                description: stripLeadingHeading(SAFETY_DOCS),
            },
            {
                name: DOC_TAGS.text,
                description: stripLeadingHeading(TEXT_GENERATION_DOCS),
            },
            {
                name: DOC_TAGS.image,
                description: stripLeadingHeading(IMAGE_GENERATION_DOCS),
            },
            {
                name: DOC_TAGS.video,
                description: stripLeadingHeading(VIDEO_GENERATION_DOCS),
            },
            {
                name: DOC_TAGS.realtime,
                description: stripLeadingHeading(REALTIME_DOCS),
            },
            {
                name: DOC_TAGS.audio,
                description: stripLeadingHeading(AUDIO_GENERATION_DOCS),
            },
            {
                name: DOC_TAGS.embeddings,
                description: stripLeadingHeading(EMBEDDINGS_DOCS),
            },
            {
                name: DOC_TAGS.models,
                description: stripLeadingHeading(MODELS_DOCS),
            },
            {
                name: DOC_TAGS.quests,
                description: "Public quest catalog and available rewards.",
            },
            {
                name: DOC_TAGS.mediaStorage,
                description: stripLeadingHeading(MEDIA_STORAGE_DOCS),
            },
            {
                name: DOC_TAGS.account,
                description: stripLeadingHeading(ACCOUNT_DOCS),
            },
            {
                name: DOC_TAGS.publicStats,
                description: stripLeadingHeading(PUBLIC_STATS_DOCS),
            },
        ],
    };
}

let generationSchemaPromise: Promise<OpenApiSchema> | undefined;

function getGenerationSchema(genApp: Hono<Env>): Promise<OpenApiSchema> {
    generationSchemaPromise ??= generateSpecs(genApp, {
        documentation: generationDocumentation(),
    }).then((schema) => transformGenerationSchema(schema as OpenApiSchema));
    return generationSchemaPromise;
}

function normalizeDocTagName(tag: string): string {
    return LEGACY_DOC_TAGS[tag] ?? tag;
}

function normalizeDocTagObjects(tags: OpenApiSchema[]): OpenApiSchema[] {
    return mergeTags(
        tags.map((tag) =>
            typeof tag.name === "string"
                ? { ...tag, name: normalizeDocTagName(tag.name) }
                : tag,
        ),
        [],
    );
}

function normalizeOperationTags(paths: OpenApiSchema): void {
    for (const pathItem of Object.values(paths)) {
        if (!pathItem || typeof pathItem !== "object") continue;
        for (const operation of Object.values(pathItem as OpenApiSchema)) {
            if (!operation || typeof operation !== "object") continue;
            const record = operation as { tags?: unknown };
            if (!Array.isArray(record.tags)) continue;
            record.tags = record.tags.map((tag) =>
                typeof tag === "string" ? normalizeDocTagName(tag) : tag,
            );
        }
    }
}

function transformGenerationSchema(schema: OpenApiSchema): OpenApiSchema {
    const paths: OpenApiSchema = {};
    for (const [path, value] of Object.entries(asRecord(schema.paths))) {
        const publicPath = path.replace(/^\/api\/account(?=\/|$)/, "/account");
        paths[publicPath] = value;
    }
    normalizeOperationTags(paths);

    return hideUndocumentedChatCompatFields(
        filterAliases({
            ...schema,
            paths,
        }),
    );
}

async function fetchEnterSchema(c: Context<Env>) {
    const url = new URL(c.req.url);
    url.pathname = "/api/docs/open-api/generate-schema";
    const response = await c.env.ENTER.fetch(
        new Request(url, {
            method: "GET",
            headers: c.req.raw.headers,
        }),
    );
    if (!response.ok) return undefined;

    const schema = (await response.json()) as OpenApiSchema;
    return transformEnterSchema(stripGenerationPaths(schema));
}

async function fetchMediaSchema(): Promise<OpenApiSchema | undefined> {
    const response = await fetch("https://media.pollinations.ai/openapi.json");
    if (!response.ok) return undefined;
    const schema = (await response.json()) as OpenApiSchema;

    for (const [path, operations] of Object.entries(asRecord(schema.paths))) {
        if (!operations || typeof operations !== "object") continue;
        (operations as OpenApiSchema).servers = [
            { url: "https://media.pollinations.ai" },
        ];
        for (const [method, operation] of Object.entries(
            operations as OpenApiSchema,
        )) {
            if (!operation || typeof operation !== "object") continue;
            const record = operation as { tags?: unknown; security?: unknown };
            if (!Array.isArray(record.tags)) continue;
            record.tags = record.tags.map((tag) =>
                typeof tag === "string" ? normalizeDocTagName(tag) : tag,
            );
            // Public read routes do not require auth. Defensive override in
            // case the upstream media spec hasn't been redeployed with the
            // explicit `security: []` setting yet.
            if (isPublicMediaRead(method, path)) {
                record.security = [];
            }
        }
    }

    return schema;
}

function isPublicMediaRead(method: string, path: string): boolean {
    const lower = method.toLowerCase();
    if (lower !== "get" && lower !== "head") return false;
    return path === "/{hash}" || path === "/{hash}/metadata";
}

function transformEnterSchema(schema: OpenApiSchema): OpenApiSchema {
    const paths: OpenApiSchema = {};
    for (const [path, value] of Object.entries(asRecord(schema.paths))) {
        if (!isPublicEnterPath(path)) continue;
        paths[publicEnterPath(path)] = value;
    }
    normalizeOperationTags(paths);
    return {
        ...schema,
        tags: tagsForPaths(
            {
                ...schema,
                tags: normalizeDocTagObjects(asRecordArray(schema.tags)),
            },
            paths,
        ),
        paths,
    };
}

function isPublicEnterPath(path: string): boolean {
    return isPublicAccountPath(path) || isPublicQuestCatalogPath(path);
}

function isPublicAccountPath(path: string): boolean {
    return (
        path === "/account" ||
        path.startsWith("/account/") ||
        path === "/api/account" ||
        path.startsWith("/api/account/")
    );
}

// Only the catalog is part of the public gen API. Session-only dashboard quest
// actions stay on enter and are omitted from the merged gen docs.
function isPublicQuestCatalogPath(path: string): boolean {
    return path === "/quests/catalog" || path === "/api/quests/catalog";
}

function publicEnterPath(path: string): string {
    return path
        .replace(/^\/api\/account(?=\/|$)/, "/account")
        .replace(/^\/api\/quests(?=\/|$)/, "/quests");
}

function tagsForPaths(
    schema: OpenApiSchema,
    paths: OpenApiSchema,
): OpenApiSchema[] {
    const usedTags = new Set<string>();
    for (const pathItem of Object.values(paths)) {
        if (!pathItem || typeof pathItem !== "object") continue;
        for (const operation of Object.values(pathItem as OpenApiSchema)) {
            if (!operation || typeof operation !== "object") continue;
            const tags = (operation as { tags?: unknown }).tags;
            if (!Array.isArray(tags)) continue;
            for (const tag of tags) {
                if (typeof tag === "string") usedTags.add(tag);
            }
        }
    }

    return asRecordArray(schema.tags).filter(
        (tag) => typeof tag.name === "string" && usedTags.has(tag.name),
    );
}

function stripGenerationPaths(schema: OpenApiSchema): OpenApiSchema {
    const paths: OpenApiSchema = {};
    for (const [path, value] of Object.entries(asRecord(schema.paths))) {
        if (!isGenerationPath(path)) {
            paths[path] = value;
        }
    }
    return { ...schema, paths };
}

function isGenerationPath(path: string): boolean {
    return (
        path === "/models" ||
        path === "/v1" ||
        path.startsWith("/v1/") ||
        path === "/image" ||
        path.startsWith("/image/") ||
        path === "/text" ||
        path.startsWith("/text/") ||
        path === "/audio" ||
        path.startsWith("/audio/") ||
        path === "/video" ||
        path.startsWith("/video/") ||
        path === "/generate" ||
        path.startsWith("/generate/")
    );
}

function injectSamples(schema: OpenApiSchema): OpenApiSchema {
    const paths = schema.paths as Record<string, unknown> | undefined;
    if (!paths) return schema;

    for (const [path, value] of Object.entries(paths)) {
        if (!value || typeof value !== "object") continue;
        const normalizedPath = path
            .replace(/:(\w+)\{[^}]*\}/g, "{$1}")
            .replace(/:(\w+)/g, "{$1}");
        for (const [method, operation] of Object.entries(
            value as Record<string, unknown>,
        )) {
            if (!operation || typeof operation !== "object") continue;
            const key = `${method} ${normalizedPath}`;
            const samples = CODE_SAMPLES[key];
            if (samples) {
                (operation as Record<string, unknown>)["x-codeSamples"] =
                    samples;
            }
            const example = RESPONSE_EXAMPLES[key];
            if (example) {
                const responses = (operation as Record<string, unknown>)
                    .responses as Record<string, unknown> | undefined;
                const ok = responses?.["200"] as
                    | Record<string, unknown>
                    | undefined;
                const content = ok?.content as
                    | Record<string, unknown>
                    | undefined;
                const json = content?.["application/json"] as
                    | Record<string, unknown>
                    | undefined;
                if (json) {
                    json.example = example;
                }
            }
        }
    }

    return schema;
}

function mergeSchemas(
    generationSchema: OpenApiSchema,
    enterSchema?: OpenApiSchema,
    mediaSchema?: OpenApiSchema,
): OpenApiSchema {
    const merged = filterAliases({
        ...(enterSchema ?? {}),
        ...generationSchema,
        info: generationSchema.info,
        servers: generationSchema.servers,
        security: generationSchema.security,
        tags: mergeTags(
            asRecordArray(generationSchema.tags),
            asRecordArray(enterSchema?.tags),
        ),
        components: mergeComponents(
            asRecord(enterSchema?.components),
            asRecord(generationSchema.components),
        ),
        paths: {
            ...asRecord(enterSchema?.paths),
            ...asRecord(generationSchema.paths),
        },
    });

    if (!mediaSchema) return merged;

    return filterAliases({
        ...merged,
        components: mergeComponents(
            asRecord(merged.components),
            asRecord(mediaSchema.components),
        ),
        paths: {
            ...asRecord(merged.paths),
            ...asRecord(mediaSchema.paths),
        },
    });
}

function mergeTags(primary: OpenApiSchema[], secondary: OpenApiSchema[]) {
    const tags = new Map<string, OpenApiSchema>();
    for (const tag of [...primary, ...secondary]) {
        if (typeof tag.name === "string" && !tags.has(tag.name)) {
            tags.set(tag.name, tag);
        }
    }
    return [...tags.values()];
}

function mergeComponents(base: OpenApiSchema, overrides: OpenApiSchema) {
    const merged: OpenApiSchema = { ...base };
    for (const [key, value] of Object.entries(overrides)) {
        const baseValue = merged[key];
        if (
            baseValue &&
            value &&
            typeof baseValue === "object" &&
            typeof value === "object" &&
            !Array.isArray(baseValue) &&
            !Array.isArray(value)
        ) {
            merged[key] = { ...baseValue, ...value };
        } else {
            merged[key] = value;
        }
    }
    return merged;
}

function asRecord(value: unknown): OpenApiSchema {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as OpenApiSchema;
}

function asRecordArray(value: unknown): OpenApiSchema[] {
    if (!Array.isArray(value)) return [];
    return value.filter(
        (item): item is OpenApiSchema =>
            !!item && typeof item === "object" && !Array.isArray(item),
    );
}

type Guide = {
    id: GuideId;
    title: string;
    icon: string;
    summary: string;
    markdown: string;
};

const GUIDES: Guide[] = [
    {
        id: "byop",
        title: "BYOP",
        icon: DOC_TAGS.byop,
        summary:
            "Let your users authorize your app to spend their own Pollen on Pollinations requests.",
        markdown: BYOP_DOCS,
    },
    {
        id: "cli",
        title: "CLI",
        icon: DOC_TAGS.cli,
        summary:
            "The Pollinations CLI — for humans, AI agents, and everything in between.",
        markdown: CLI_DOCS,
    },
    {
        id: "mcp",
        title: "MCP Server",
        icon: DOC_TAGS.mcpServer,
        summary:
            "Wire Pollinations into Claude Desktop, Cursor, and other MCP-compatible clients.",
        markdown: MCP_DOCS,
    },
];

const GUIDES_BY_ID = new Map(GUIDES.map((g) => [g.id, g]));

function guidesPage(c: Context<Env>, body: string): string {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${SEO_TITLE}</title>
<link rel="icon" type="image/png" href="${FAVICON_DATA_URI}" />
${docsSocialHeadTags(c)}
<style>${GUIDES_CSS}</style>
</head>
<body>
${pollinationsHeaderHtml()}
<main class="wrap">${body}</main>
</body>
</html>`;
}

function guidesIndexHtml(c: Context<Env>): string {
    const cards = GUIDES.map(
        (g) =>
            `<a class="guide-card" href="/docs/guides/${g.id}"><h3>${guideIconHtml(g.icon)}<span>${g.title}</span></h3><p>${g.summary}</p></a>`,
    ).join("");
    const body = `<h1>Guides</h1><p>Integration paths beyond the raw API.</p><div class="guide-cards">${cards}</div>`;
    return guidesPage(c, body);
}

function guideIconHtml(icon: string): string {
    return DOC_TAG_ICON_HTML[icon] ?? "";
}

function guideHtml(c: Context<Env>, guide: Guide): string {
    // Prepend the guide title as an H1 so each guide page has a clear heading.
    // Source READMEs have their H1 stripped (because we render the page title
    // separately) — re-adding it here gives the rendered page a proper title
    // without duplicating it across surfaces.
    const rendered = marked.parse(guide.markdown, { async: false }) as string;
    return guidesPage(
        c,
        `<h1 class="guide-title">${guideIconHtml(guide.icon)}<span>${guide.title}</span></h1>${rendered}`,
    );
}

/**
 * Build the merged OpenAPI spec (generation + public account + media storage,
 * with code samples injected). Single source of truth for both the docs
 * Scalar route and the conventional /openapi.json alias.
 */
export async function buildMergedOpenApiSpec(
    c: Context<Env>,
    genApp: Hono<Env>,
): Promise<OpenApiSchema> {
    const [generationSchema, enterSchema, mediaSchema] = await Promise.all([
        getGenerationSchema(genApp),
        fetchEnterSchema(c).catch(() => undefined),
        fetchMediaSchema().catch(() => undefined),
    ]);
    return injectSamples(
        mergeSchemas(generationSchema, enterSchema, mediaSchema),
    );
}

export function createDocsRoutes(genApp: Hono<Env>): Hono<Env> {
    return new Hono<Env>()
        .get("/", async (c, next) => {
            const response = await Scalar<Env>({
                pageTitle: SEO_TITLE,
                title: SEO_TITLE,
                favicon: FAVICON_DATA_URI,
                theme: "saturn",
                darkMode: true,
                forceDarkModeState: "dark",
                hideDarkModeToggle: true,
                showDeveloperTools: "never",
                customCss: API_REFERENCE_CUSTOM_CSS,
                hideModels: true,
                hideClientButton: true,
                sources: [
                    { url: "/docs/open-api/generate-schema", title: "API" },
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
            const htmlWithMeta = injectDocsSocialHead(html, c);
            const bodyOpenMatch = htmlWithMeta.match(/<body[^>]*>/);
            if (!bodyOpenMatch || bodyOpenMatch.index === undefined) {
                return c.html(htmlWithMeta);
            }
            const insertAt = bodyOpenMatch.index + bodyOpenMatch[0].length;
            return c.html(
                htmlWithMeta.slice(0, insertAt) +
                    pollinationsHeaderHtml(true) +
                    htmlWithMeta.slice(insertAt),
            );
        })
        .get("/logo.svg", (c) => {
            c.header("Content-Type", "image/svg+xml");
            c.header("Cache-Control", "public, max-age=86400");
            return c.body(LOGO_WHITE_SVG);
        })
        .get("/llm.txt", (c) => {
            c.header("Cache-Control", "public, max-age=3600");
            const section = c.req.query("section");
            if (!section) return c.text(LLM_DOC_TEXT);
            const content = LLM_DOC_SECTIONS[section];
            if (!content) return c.text("Section not found", 404);
            return c.text(content);
        })
        .get("/guides", (c) => c.html(guidesIndexHtml(c)))
        .get("/guides/:id", (c) => {
            const guide = GUIDES_BY_ID.get(c.req.param("id") as GuideId);
            if (!guide) return c.text("Guide not found", 404);
            return c.html(guideHtml(c, guide));
        })
        .get("/open-api/generate-schema", async (c) => {
            const merged = await buildMergedOpenApiSpec(c, genApp);
            if (c.req.query("format") === "yaml") {
                c.header("Content-Type", "application/yaml; charset=utf-8");
                return c.body(yamlStringify(merged));
            }
            return c.json(merged);
        });
}
