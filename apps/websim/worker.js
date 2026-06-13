const WEBSIM_APP_KEY = "pk_wYCqFfSdCXZL8UBW";
const DEFAULT_MODEL = "openai-fast";
const ALLOWED_MODELS = [
    DEFAULT_MODEL,
    "openai",
    "claude-fast",
    "gemini-fast",
    "gemini",
];
const ALLOWED_MODEL_SET = new Set(ALLOWED_MODELS);

const systemPrompt = `You are an HTML generator. Your task is to return a single, complete HTML file that implements what the user asks for.
The HTML should be valid, self-contained, and ready to be rendered in a browser.

Follow the Plain Vanilla Web approach:
- No build tools, no frameworks - just HTML, CSS, JavaScript
- Everything in a single HTML file
- Browser-native technologies only

Implementation patterns:
- CSS: inline in <style>, use CSS variables (--var), component-scoped selectors
- JS: Web Components (class extends HTMLElement), connectedCallback for initialization
- External libs: CDN imports, ES modules with import maps where needed

Include all necessary CSS inline within a <style> tag in the head section.
Include all necessary JavaScript within <script> tags, preferably at the end of the body.
Make the design clean, modern, and responsive.
Write the code in a sequence that lets the browser already render something meaningful while it is being transmitted.
Imagine you are coding for a demoscene challenge where code should be short and elegant.
Use images from src="https://image.pollinations.ai/prompt/[urlencoded prompt]?width=[width]&height=[height]"
Links to subpages should always be relative without a leading slash. Don't use JS-based links unless it is triggering something interactive. New content should usually come by following a real link.
You are targeting modern browsers.
Please include open-graph metatags and use a Pollinations image for the thumbnail / image preview. include 'og:image:width' and 'og:image:height`;

const STATIC_PATHS = new Set([
    "/",
    "/index.html",
    "/favicon.ico",
    "/favicon-16x16.png",
    "/favicon-32x32.png",
    "/apple-touch-icon.png",
    "/apple-touch-icon-152x152.png",
    "/apple-touch-icon-167x167.png",
    "/icon-192.png",
    "/icon-512.png",
    "/icon-maskable-512.png",
    "/manifest.webmanifest",
    "/og-image.png",
    "/robots.txt",
]);

export default {
    async fetch(request, env) {
        return handleRequest(request, env);
    },
};

async function handleRequest(request, env) {
    if (request.method === "OPTIONS") {
        return handleCorsPreflightRequest();
    }

    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
        return jsonResponse({
            ok: true,
            defaultModel: DEFAULT_MODEL,
            models: ALLOWED_MODELS,
            generationMode: "non-streaming",
            auth: env.TEXT_API_TOKEN ? "secret" : "app-key",
            assets: Boolean(env.ASSETS),
        });
    }

    if (url.pathname === "/api/generate") {
        return handleGenerateApi(request, env);
    }

    if (request.method === "HEAD" && isAssetPath(url.pathname)) {
        return serveAsset(request, env);
    }

    if (request.method !== "GET") {
        return new Response("Method not allowed", {
            status: 405,
            headers: {
                Allow: "GET, HEAD, POST, OPTIONS",
                ...getCorsHeaders(),
            },
        });
    }

    if (isAssetPath(url.pathname)) {
        return serveAsset(request, env);
    }

    const pathResponse = processPath(url.pathname, request);
    if (pathResponse) return pathResponse;

    const prompt = extractPromptFromPath(url.pathname);
    if (!prompt) return serveAsset(request, env);

    return generateHtml(prompt, request, env);
}

async function handleGenerateApi(request, env) {
    if (request.method !== "POST") {
        return new Response("Method not allowed", {
            status: 405,
            headers: {
                Allow: "POST, OPTIONS",
                ...getCorsHeaders(),
            },
        });
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
        return jsonResponse({ error: "Prompt is required" }, 400);
    }

    return generateHtml(prompt, request, env, body.model);
}

function isAssetPath(pathname) {
    return pathname.startsWith("/assets/") || STATIC_PATHS.has(pathname);
}

function serveAsset(request, env) {
    if (!env.ASSETS) {
        return new Response("Websim app assets are not configured.", {
            status: 503,
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "no-store",
            },
        });
    }

    return env.ASSETS.fetch(request);
}

function getCorsHeaders() {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
}

function handleCorsPreflightRequest() {
    return new Response(null, {
        status: 204,
        headers: {
            ...getCorsHeaders(),
            "Access-Control-Max-Age": "86400",
        },
    });
}

function processPath(path, request) {
    if (path.startsWith("/.")) {
        return new Response("Not found", {
            status: 404,
            headers: getCorsHeaders(),
        });
    }

    if (shouldRedirectWithTrailingSlash(path)) {
        const redirectUrl = new URL(request.url);
        redirectUrl.pathname += "/";

        return new Response(null, {
            status: 301,
            headers: {
                ...getCorsHeaders(),
                Location: redirectUrl.toString(),
            },
        });
    }

    return null;
}

function shouldRedirectWithTrailingSlash(path) {
    if (path === "/" || path.endsWith("/")) {
        return false;
    }

    const slashCount = (path.match(/\//g) || []).length;
    return slashCount <= 1;
}

function extractPromptFromPath(path) {
    const encodedPrompt = path.slice(1, path.endsWith("/") ? -1 : undefined);
    try {
        return decodeURIComponent(encodedPrompt).trim();
    } catch {
        return encodedPrompt.trim();
    }
}

async function generateHtml(prompt, request, env, modelOverride) {
    const url = new URL(request.url);
    const model = resolveModel(modelOverride || url.searchParams.get("model"));
    const upstream = await fetchFromTextApi(prompt, model, request, env);

    if (!upstream.ok) {
        return upstreamErrorResponse(upstream);
    }

    const data = await upstream.json();
    const html = extractGeneratedHtml(data.choices?.[0]?.message?.content);

    return new Response(html, {
        headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Encoding": "identity",
            "Cache-Control": "no-store",
            ...getCorsHeaders(),
        },
    });
}

function resolveModel(model) {
    if (typeof model !== "string") return DEFAULT_MODEL;
    const trimmed = model.trim();
    return ALLOWED_MODEL_SET.has(trimmed) ? trimmed : DEFAULT_MODEL;
}

function fetchFromTextApi(prompt, model, request, env) {
    const headers = {
        "Content-Type": "application/json",
    };
    const token = resolveTextApiToken(request, env);

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    return fetch("https://gen.pollinations.ai/v1/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify({
            model,
            stream: false,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt },
            ],
        }),
    });
}

function extractGeneratedHtml(value) {
    const content = String(value || "").trim();
    if (!content) {
        return renderGeneratedFallback("No HTML was generated.");
    }

    const withoutFence = content
        .replace(/^```html\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```$/i, "")
        .trim();
    const lower = withoutFence.toLowerCase();
    const htmlIndex = lower.indexOf("<html");

    if (htmlIndex === -1) {
        return renderGeneratedFallback(withoutFence);
    }

    const doctypeIndex = lower.lastIndexOf("<!doctype", htmlIndex);
    const start = doctypeIndex === -1 ? htmlIndex : doctypeIndex;
    const endIndex = lower.indexOf("</html>", htmlIndex);
    if (endIndex === -1) {
        return withoutFence.slice(start);
    }

    return withoutFence.slice(start, endIndex + "</html>".length);
}

function renderGeneratedFallback(content) {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Websim</title>
</head>
<body>
<pre>${escapeHtml(content)}</pre>
</body>
</html>`;
}

function resolveTextApiToken(request, env) {
    const requestToken = bearerToken(request.headers.get("Authorization"));
    return (
        requestToken ||
        env.TEXT_API_TOKEN ||
        env.WEBSIM_APP_KEY ||
        WEBSIM_APP_KEY
    );
}

function bearerToken(value) {
    if (!value) return "";
    const match = value.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim() || "";
}

async function upstreamErrorResponse(upstream) {
    const upstreamStatus = upstream?.status || 502;
    const status =
        upstreamStatus >= 400 && upstreamStatus < 500 ? upstreamStatus : 502;
    const detail = upstream ? await readResponsePreview(upstream, 4096) : "";

    return new Response(
        renderErrorPage(
            `Upstream error ${upstreamStatus}`,
            detail ||
                "The Pollinations text API did not return generated HTML for this request.",
        ),
        {
            status,
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-store",
                ...getCorsHeaders(),
            },
        },
    );
}

async function readResponsePreview(response, maxChars) {
    if (!response.body) return "";

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let result = "";

    try {
        while (result.length < maxChars) {
            const { value, done } = await reader.read();
            if (done) break;
            result += decoder.decode(value, { stream: true });
        }
        result += decoder.decode();
    } catch {
        return "";
    } finally {
        await reader.cancel().catch(() => {});
    }

    return result.slice(0, maxChars);
}

function renderErrorPage(title, detail) {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} | Websim</title>
<style>
:root{color-scheme:light dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#f7f3ff;color:#21163a}
body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px}
main{width:min(640px,100%);border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:16px;background:color-mix(in srgb,Canvas 88%,transparent);padding:24px;box-shadow:0 18px 60px color-mix(in srgb,currentColor 12%,transparent)}
h1{margin:0 0 12px;font-size:clamp(1.5rem,4vw,2.4rem);line-height:1.05}
pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:16px 0 0;padding:16px;border-radius:12px;background:color-mix(in srgb,currentColor 8%,transparent);font-size:.9rem}
a{color:inherit}
</style>
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
<p>Websim could not generate this page.</p>
<pre>${escapeHtml(detail)}</pre>
<p><a href="/">Return to Websim</a></p>
</main>
</body>
</html>`;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            ...getCorsHeaders(),
        },
    });
}
