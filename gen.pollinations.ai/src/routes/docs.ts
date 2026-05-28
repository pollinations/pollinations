import { Scalar } from "@scalar/hono-api-reference";
import { AUDIO_SERVICES, ELEVENLABS_VOICES } from "@shared/registry/audio.ts";
import { EMBEDDING_SERVICES } from "@shared/registry/embeddings.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import type { Context } from "hono";
import { Hono } from "hono";
import { generateSpecs } from "hono-openapi";
import { marked } from "marked";
import { stringify as yamlStringify } from "yaml";
import type { Env } from "@/env.ts";
import LOGO_WHITE_SVG from "../../../assets/logo-text-white.svg?raw";

// Same favicon as enter.pollinations.ai (32×32 PNG, ~1.3kB → inlined as a
// data URI so we don't need a separate binary asset route or a build-time
// step. Update this if enter's favicon ever changes.
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
import QUICK_START_MD from "../docs/quick-start.md?raw";
import SAFETY_MD from "../docs/safety.md?raw";
import TEXT_GENERATION_MD from "../docs/text-generation.md?raw";
import VIDEO_GENERATION_MD from "../docs/video-generation.md?raw";

type OpenApiSchema = Record<string, unknown>;

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

const imageModelDisplayNames = Object.keys(IMAGE_SERVICES)
    .filter(
        (id) =>
            !(
                IMAGE_SERVICES[id as keyof typeof IMAGE_SERVICES]
                    .outputModalities as string[] | undefined
            )?.includes("video"),
    )
    .join(", ");

const videoModelDisplayNames = Object.keys(IMAGE_SERVICES)
    .filter((id) =>
        (
            IMAGE_SERVICES[id as keyof typeof IMAGE_SERVICES]
                .outputModalities as string[] | undefined
        )?.includes("video"),
    )
    .join(", ");

const textModelDisplayNames = Object.keys(TEXT_SERVICES).join(", ");
const audioModelDisplayNames = Object.keys(AUDIO_SERVICES).join(", ");
const embeddingModelDisplayNames = Object.keys(EMBEDDING_SERVICES).join(", ");

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

// Substitute live registry values into the section markdown.
const MODEL_VARS: Record<string, string> = {
    TEXT_MODELS: textModelDisplayNames,
    IMAGE_MODELS: imageModelDisplayNames,
    VIDEO_MODELS: videoModelDisplayNames,
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
    AUDIO_GENERATION_DOCS,
    EMBEDDINGS_DOCS,
    MODELS_DOCS,
    MEDIA_STORAGE_DOCS,
    ACCOUNT_DOCS,
    SAFETY_DOCS,
    ERRORS_DOCS,
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

const POLLINATIONS_HEADER_CSS = `
.ph-bar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 2147483000;
    min-height: 48px; box-sizing: border-box;
    background: #0a0a0a; border-bottom: 1px solid #1f1f23;
    display: flex; align-items: center; gap: 10px; padding: 8px 14px;
    font: 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    color: #d4d4d8;
}
.ph-bar .ph-brand {
    color: #fafafa; text-decoration: none;
    display: inline-flex; align-items: center; flex-shrink: 0;
}
.ph-bar .ph-brand img { height: 18px; width: auto; display: block; }
@media (min-width: 640px) { .ph-bar .ph-brand img { height: 20px; } }
@media (max-width: 640px) {
    .ph-bar { justify-content: center; padding: 8px 12px; }
    .ph-bar .ph-brand img { height: 22px; }
}

.ph-fab-cluster {
    position: fixed; top: 64px; right: 18px; z-index: 9999;
    display: flex; gap: 8px; align-items: center;
    justify-content: flex-end; max-width: calc(100vw - 36px);
}
.ph-fab {
    padding: 10px 14px; border-radius: 999px;
    border: 1px solid #f59e0b; background: #f59e0b; color: #451a03;
    font: 600 14px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    box-shadow: 0 6px 20px rgba(245,158,11,.3);
    cursor: pointer; text-decoration: none;
    transition: background .15s, color .15s, box-shadow .15s, transform .1s;
    display: inline-flex; align-items: center; gap: 6px; line-height: 1;
}
.ph-fab:hover {
    background: #0a0a0a; color: #f59e0b;
    box-shadow: 0 6px 24px rgba(245,158,11,.4);
}
.ph-fab:active { transform: translateY(1px); }
.ph-fab svg { width: 16px; height: 16px; }
@media (max-width: 640px) {
    .ph-fab-cluster { top: 60px; right: 12px; }
    .ph-fab { padding: 7px 11px; font-size: 12px; }
    .ph-fab svg { width: 14px; height: 14px; }
}
`;

const POLLINATIONS_HEADER_SCALAR_CSS = `
/* Push Scalar's mount point down so its content (h1, version badges,
   sidebar, mobile hamburger row) doesn't render under our fixed bar.
   Body padding works because .ph-bar is position: fixed — it ignores
   parent padding, so the bar stays at top while everything else shifts. */
body { padding-top: 48px; }
/* Match Scalar's mobile hamburger row background to our bar so the seam
   between the two reads as one continuous header instead of a stripe. */
@media (max-width: 1000px) {
    .scalar-app [class*="lg:hidden"][class*="grid-area:header"] {
        background: #0a0a0a !important;
        border: 0 !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
    }
}
`;

const POLLINATIONS_HEADER_STANDALONE_CSS = `
body { padding-top: 48px; }
`;

type GuideId = "byop" | "cli" | "mcp";

function pollinationsHeaderHtml(scalarHosted = false): string {
    const contextCss = scalarHosted
        ? POLLINATIONS_HEADER_SCALAR_CSS
        : POLLINATIONS_HEADER_STANDALONE_CSS;
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
  function scanScalarButtons() {
    var nodes = document.querySelectorAll('button, a, [role="button"]');
    for (var i = 0; i < nodes.length; i++) {
      var text = (nodes[i].textContent || '').trim();
      if (/^ask ai\\b/i.test(text)) nodes[i].style.display = 'none';
      else if (/^show more\\b/i.test(text)) nodes[i].classList.add('ph-show-more');
    }
  }
  scanScalarButtons();
  new MutationObserver(scanScalarButtons).observe(document.body, { childList: true, subtree: true });
})();
</script>`;
}

const API_REFERENCE_CUSTOM_CSS = `
/* Each table gets its own horizontal scroll, scoped to itself, so the
   markdown container doesn't grow a second outer scrollbar that fights
   with the scroll on adjacent code blocks. */
.scalar-app .markdown table {
  display: block;
  max-width: 100%;
  width: max-content;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.scalar-app .markdown table th,
.scalar-app .markdown table td {
  word-break: normal !important;
  overflow-wrap: normal !important;
}

.scalar-app .markdown a {
  color: #f59e0b;
}
.scalar-app .markdown a:hover {
  color: #fbbf24;
}

/* Hide Scalar's native download UI — we surface it via the floating
   action cluster (see .ph-fab-cluster below) for layout consistency. */
.scalar-app .download-container { display: none !important; }

/* Hide "Powered by Scalar" sidebar footer link. */
.scalar-app a[href="https://www.scalar.com"] { display: none !important; }

/* Hide Scalar's IDE/MCP quick-launch buttons (VS Code, Cursor, Generate MCP).
   These render in the sidebar regardless of showDeveloperTools. We target
   by URL scheme so the rule survives class-name renames across Scalar
   versions, plus the section wrapper via :has() in case the buttons render
   inside a labeled group. */
.scalar-app a[href^="vscode:"],
.scalar-app a[href^="vscode-insiders:"],
.scalar-app a[href^="cursor:"],
.scalar-app a[href*="mcp.scalar.com"],
.scalar-app a[href*="generate-mcp"],
.scalar-app a[href*="modelcontextprotocol"] { display: none !important; }
.scalar-app section:has(> a[href^="vscode:"]),
.scalar-app section:has(> a[href^="cursor:"]) { display: none !important; }

/* Hide Scalar's "Ask AI" feature (sidebar button + any floating widget).
   Targeted by attribute and class fragments, case-insensitive, since the
   CDN bundle may rename the underlying classes between releases. */
.scalar-app [class*="ask-ai" i],
.scalar-app [class*="askai" i],
.scalar-app [class*="ai-assistant" i],
.scalar-app [aria-label*="Ask AI" i],
.scalar-app [title*="Ask AI" i],
.scalar-app button[data-feature="ask-ai" i] { display: none !important; }

/* Full-width prose for sections with no right-column code samples (Quick Start,
   Auth, BYOP, CLI, MCP, Errors, Safety, plain Models/Account). Scalar lays
   each tag out as two flex columns; the right column stays empty for prose-
   only tags, wasting ~50% of the page. We collapse the empty column and let
   the prose stretch. The same rule fixes the section header row above. */
.scalar-app .section-columns:has(> .section-column:nth-child(2):empty) > .section-column:first-child {
    flex: 1 1 100% !important;
    max-width: 100% !important;
}
.scalar-app .section-columns > .section-column:nth-child(2):empty {
    display: none !important;
}
.scalar-app .section-header-wrapper:not(:has(> :nth-child(2))) {
    grid-template-columns: 1fr !important;
}

/* "Show more" buttons (tagged by our header script — see scanScalarButtons).
   Promote to the amber action color so they don't disappear into the page. */
.scalar-app .ph-show-more {
    background: #f59e0b !important;
    color: #451a03 !important;
    border-color: #f59e0b !important;
}
.scalar-app .ph-show-more:hover {
    background: #fbbf24 !important;
    border-color: #fbbf24 !important;
}
/* Force the chevron/triangle SVG inside the button to match text color
   (otherwise it inherits Scalar's dim color and disappears on amber). */
.scalar-app .ph-show-more svg,
.scalar-app .ph-show-more svg * {
    color: #451a03 !important;
    fill: currentColor !important;
    stroke: currentColor !important;
}
`;

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
                tags: ["🚀 Quick Start", "🔐 Authentication"],
            },
            {
                name: "Integrations",
                tags: ["🌸 BYOP", "🖥 CLI", "🔌 MCP Server"],
            },
            {
                name: "Generation",
                tags: [
                    "✍️ Text",
                    "🖼️ Image",
                    "🎬 Video",
                    "🔊 Audio",
                    "🔢 Embeddings",
                ],
            },
            {
                name: "Resources",
                tags: [
                    "🤖 Models",
                    "📦 Media Storage",
                    "👤 Account",
                    "❌ Errors",
                    "🛡️ Safety",
                ],
            },
        ],
        tags: [
            {
                name: "🚀 Quick Start",
                description: stripLeadingHeading(QUICK_START_DOCS),
            },
            {
                name: "🔐 Authentication",
                description: stripLeadingHeading(AUTHENTICATION_DOCS),
            },
            {
                name: "🌸 BYOP",
                description: BYOP_DOCS,
            },
            {
                name: "🖥 CLI",
                description: CLI_DOCS,
            },
            {
                name: "🔌 MCP Server",
                description: MCP_DOCS,
            },
            {
                name: "❌ Errors",
                description: stripLeadingHeading(ERRORS_DOCS),
            },
            {
                name: "🛡️ Safety",
                description: stripLeadingHeading(SAFETY_DOCS),
            },
            {
                name: "✍️ Text",
                description: stripLeadingHeading(TEXT_GENERATION_DOCS),
            },
            {
                name: "🖼️ Image",
                description: stripLeadingHeading(IMAGE_GENERATION_DOCS),
            },
            {
                name: "🎬 Video",
                description: stripLeadingHeading(VIDEO_GENERATION_DOCS),
            },
            {
                name: "🔊 Audio",
                description: stripLeadingHeading(AUDIO_GENERATION_DOCS),
            },
            {
                name: "🔢 Embeddings",
                description: stripLeadingHeading(EMBEDDINGS_DOCS),
            },
            {
                name: "🤖 Models",
                description: stripLeadingHeading(MODELS_DOCS),
            },
            {
                name: "📦 Media Storage",
                description: stripLeadingHeading(MEDIA_STORAGE_DOCS),
            },
            {
                name: "👤 Account",
                description: stripLeadingHeading(ACCOUNT_DOCS),
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

function transformGenerationSchema(schema: OpenApiSchema): OpenApiSchema {
    const paths: OpenApiSchema = {};
    for (const [path, value] of Object.entries(asRecord(schema.paths))) {
        const publicPath = path.replace(/^\/api\/account(?=\/|$)/, "/account");
        paths[publicPath] = value;
    }

    return filterAliases({
        ...schema,
        paths,
    });
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
                tag === "media.pollinations.ai" ? "📦 Media Storage" : tag,
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
        if (!isPublicAccountPath(path)) continue;
        const publicPath = path.replace(/^\/api\/account(?=\/|$)/, "/account");
        paths[publicPath] = value;
    }
    return { ...schema, tags: tagsForPaths(schema, paths), paths };
}

function isPublicAccountPath(path: string): boolean {
    return (
        path === "/account" ||
        path.startsWith("/account/") ||
        path === "/api/account" ||
        path.startsWith("/api/account/")
    );
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

// ---------------------------------------------------------------------------
// x-codeSamples: multi-language examples injected into the OpenAPI schema
// ---------------------------------------------------------------------------
const CODE_SAMPLES: Record<
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
    print(f"{record['model']}: {record['pollen_spent']} pollen")`,
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
const RESPONSE_EXAMPLES: Record<string, unknown> = {
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
    emoji: string;
    summary: string;
    markdown: string;
};

const GUIDES: Guide[] = [
    {
        id: "byop",
        title: "BYOP",
        emoji: "🌸",
        summary:
            "Let your users authorize your app to spend their own Pollen on Pollinations requests.",
        markdown: BYOP_DOCS,
    },
    {
        id: "cli",
        title: "CLI",
        emoji: "🖥️",
        summary:
            "The Pollinations CLI — for humans, AI agents, and everything in between.",
        markdown: CLI_DOCS,
    },
    {
        id: "mcp",
        title: "MCP Server",
        emoji: "🔌",
        summary:
            "Wire Pollinations into Claude Desktop, Cursor, and other MCP-compatible clients.",
        markdown: MCP_DOCS,
    },
];

const GUIDES_BY_ID = new Map(GUIDES.map((g) => [g.id, g]));

const GUIDES_CSS = `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
html, body { overflow-x: hidden; }
body {
    font: 15px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    color: #d4d4d8;
    background: #0a0a0a;
    margin: 0;
}
.wrap { max-width: 800px; margin: 0 auto; padding: 1.5rem 1.25rem 4rem; }
h1, h2, h3, h4 { font-weight: 600; line-height: 1.3; margin: 2rem 0 .75rem; color: #fafafa; }
h1 { font-size: 1.875rem; margin-top: 1rem; }
h2 { font-size: 1.375rem; padding-bottom: .375rem; border-bottom: 1px solid #27272a; }
h3 { font-size: 1.125rem; }
p, li, blockquote { overflow-wrap: anywhere; word-break: break-word; }
p { margin: .75rem 0; }
code {
    background: #18181b; padding: 2px 5px; border-radius: 4px; color: #f4f4f5;
    font: 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    overflow-wrap: anywhere; word-break: break-word;
}
pre {
    background: #000; color: #f1f5f9; padding: 1rem; border-radius: 8px;
    border: 1px solid #1f1f23; overflow-x: auto; font-size: 13px; line-height: 1.5;
    max-width: 100%;
}
pre code {
    background: transparent; color: inherit; padding: 0;
    overflow-wrap: normal; word-break: normal; white-space: pre;
}
table {
    display: block; max-width: 100%; width: max-content;
    overflow-x: auto; -webkit-overflow-scrolling: touch;
    border-collapse: collapse; margin: 1rem 0; font-size: .9rem;
}
th, td { padding: .5rem .75rem; border: 1px solid #27272a; text-align: left; vertical-align: top; }
th { background: #18181b; font-weight: 600; color: #fafafa; }
a { color: #f59e0b; text-decoration: none; overflow-wrap: anywhere; word-break: break-word; }
a:hover { text-decoration: underline; }
blockquote { border-left: 3px solid #3f3f46; padding: .25rem 1rem; color: #a1a1aa; margin: 1rem 0; background: #131316; }
ul, ol { padding-left: 1.5rem; }
li { margin: .25rem 0; }
hr { border: 0; border-top: 1px solid #27272a; margin: 2rem 0; }
img { max-width: 100%; height: auto; }
.guide-cards { display: grid; gap: 1rem; grid-template-columns: 1fr; margin-top: 1.5rem; }
@media (min-width: 600px) { .guide-cards { grid-template-columns: 1fr 1fr; } }
.guide-card {
    display: block; padding: 1.25rem; border: 1px solid #27272a; border-radius: 10px;
    background: #131316; color: #fafafa; text-decoration: none; transition: border-color .15s, background .15s;
}
.guide-card:hover { border-color: #f59e0b; background: #161618; }
.guide-card h3 { margin: 0 0 .375rem; font-size: 1.05rem; color: #fafafa; }
.guide-card p { margin: 0; color: #a1a1aa; font-size: .9rem; }
`;

function guidesPage(body: string): string {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>pollinations.ai - Docs</title>
<link rel="icon" type="image/png" href="${FAVICON_DATA_URI}" />
<style>${GUIDES_CSS}</style>
</head>
<body>
${pollinationsHeaderHtml()}
<main class="wrap">${body}</main>
</body>
</html>`;
}

function guidesIndexHtml(): string {
    const cards = GUIDES.map(
        (g) =>
            `<a class="guide-card" href="/docs/guides/${g.id}"><h3>${g.emoji} ${g.title}</h3><p>${g.summary}</p></a>`,
    ).join("");
    const body = `<h1>Guides</h1><p>Integration paths beyond the raw API.</p><div class="guide-cards">${cards}</div>`;
    return guidesPage(body);
}

function guideHtml(guide: Guide): string {
    // Prepend the guide title as an H1 so each guide page has a clear heading.
    // Source READMEs have their H1 stripped (because we render the page title
    // separately) — re-adding it here gives the rendered page a proper title
    // without duplicating it across surfaces.
    const rendered = marked.parse(
        `# ${guide.emoji} ${guide.title}\n\n${guide.markdown}`,
        { async: false },
    ) as string;
    return guidesPage(rendered);
}

export function createDocsRoutes(genApp: Hono<Env>): Hono<Env> {
    return new Hono<Env>()
        .get("/", async (c, next) => {
            const response = await Scalar<Env>({
                pageTitle: "pollinations.ai - Docs",
                title: "pollinations.ai - Docs",
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
            const bodyOpenMatch = html.match(/<body[^>]*>/);
            if (!bodyOpenMatch || bodyOpenMatch.index === undefined) {
                return c.html(html);
            }
            const insertAt = bodyOpenMatch.index + bodyOpenMatch[0].length;
            return c.html(
                html.slice(0, insertAt) +
                    pollinationsHeaderHtml(true) +
                    html.slice(insertAt),
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
        .get("/guides", (c) => c.html(guidesIndexHtml()))
        .get("/guides/:id", (c) => {
            const guide = GUIDES_BY_ID.get(c.req.param("id") as GuideId);
            if (!guide) return c.text("Guide not found", 404);
            return c.html(guideHtml(guide));
        })
        .get("/open-api/generate-schema", async (c) => {
            const [generationSchema, enterSchema, mediaSchema] =
                await Promise.all([
                    getGenerationSchema(genApp),
                    fetchEnterSchema(c).catch(() => undefined),
                    fetchMediaSchema().catch(() => undefined),
                ]);
            const merged = injectSamples(
                mergeSchemas(generationSchema, enterSchema, mediaSchema),
            );

            if (c.req.query("format") === "yaml") {
                c.header("Content-Type", "application/yaml; charset=utf-8");
                return c.body(yamlStringify(merged));
            }
            return c.json(merged);
        });
}
