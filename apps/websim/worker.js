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
The UI will be incrementally shown as the code is streamed to the frontend.
Imagine you are coding for a demoscene challenge where code should be short and elegant.
Use images from src="https://image.pollinations.ai/prompt/[urlencoded prompt]?width=[width]&height=[height]"
Links to subpages should always be relative without a leading slash. Don't use JS-based links unless it is triggering something interactive. New content should usually come by following a real link.
You are targeting modern browsers.
Please include open-graph metatags and use a Pollinations image for the thumbnail / image preview. include 'og:image:width' and 'og:image:height`;

// Main handler function
export default {
    async fetch(request, env) {
        return handleRequest(request, env);
    },
};

/**
 * Main request handler
 * @param {Request} request - The incoming request
 * @param {Object} env - The environment variables
 * @returns {Response} The response
 */
async function handleRequest(request, env) {
    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
        return handleCorsPreflightRequest();
    }

    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname);

    // Handle quick filters and redirects
    const pathResponse = processPath(path, request);
    if (pathResponse) return pathResponse;

    // Extract prompt from path
    const prompt = extractPromptFromPath(path);
    if (!prompt) {
        return new Response("Pass a prompt after /", {
            status: 400,
            headers: getCorsHeaders(),
        });
    }

    // Generate HTML from prompt
    return generateHtml(prompt, request, env);
}

/**
 * Get standard CORS headers
 * @returns {Object} CORS headers
 */
function getCorsHeaders() {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
}

/**
 * Handle CORS preflight requests
 * @returns {Response} A response with CORS headers
 */
function handleCorsPreflightRequest() {
    const headers = {
        ...getCorsHeaders(),
        "Access-Control-Max-Age": "86400", // 24 hours
    };

    return new Response(null, {
        status: 204,
        headers,
    });
}

/**
 * Process the URL path and handle redirects
 * @param {string} path - The URL path
 * @param {Request} request - The original request
 * @returns {Response|null} A response for redirects/errors or null to continue processing
 */
function processPath(path, request) {
    // Quick filters for common non-content requests
    if (path === "/favicon.ico" || path.startsWith("/.")) {
        return new Response("Not found", {
            status: 404,
            headers: getCorsHeaders(),
        });
    }

    // Enforce trailing slash only if there are 2 or less slashes in the path
    if (shouldRedirectWithTrailingSlash(path)) {
        const redirectUrl = new URL(request.url);
        redirectUrl.pathname += "/";

        // Create a new response with the same status and redirect URL, but with CORS headers
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

/**
 * Determine if the path should redirect with a trailing slash
 * @param {string} path - The URL path
 * @returns {boolean} Whether to redirect
 */
function shouldRedirectWithTrailingSlash(path) {
    if (path === "/" || path.endsWith("/")) {
        return false;
    }

    // Count the number of slashes in the path
    const slashCount = (path.match(/\//g) || []).length;

    // Only redirect if there are 1 or less slashes (including the leading slash)
    return slashCount <= 1;
}

/**
 * Extract the prompt from the URL path
 * @param {string} path - The URL path
 * @returns {string} The extracted prompt
 */
function extractPromptFromPath(path) {
    return path.slice(1, path.endsWith("/") ? -1 : undefined);
}

/**
 * Generate HTML from a prompt by calling the text API
 * @param {string} prompt - The user prompt
 * @param {Request} request - The original request
 * @param {Object} env - The environment variables
 * @returns {Response} The HTML response
 */
async function generateHtml(prompt, request, env) {
    // Get URL for query parameters
    const url = new URL(request.url);

    // Make upstream request to text API
    const upstream = await fetchFromTextApi(prompt, url, env);

    if (!upstream.ok || !upstream.body) {
        return new Response(`Upstream error ${upstream.status}`, {
            status: 502,
            headers: getCorsHeaders(),
        });
    }

    // Process the stream
    const htmlStream = upstream.body
        .pipeThrough(new TextDecoderStream()) // bytes ➜ text
        .pipeThrough(createSseToHtmlTransformer())
        .pipeThrough(createHtmlGateTransformer())
        .pipeThrough(new TextEncoderStream()); // text ➜ bytes

    // Return the response with CORS headers
    return new Response(htmlStream, {
        headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Encoding": "identity",
            "Cache-Control": "no-cache",
            ...getCorsHeaders(),
        },
    });
}

/**
 * Fetch HTML generation from the text API
 * @param {string} prompt - The user prompt
 * @param {URL} url - The URL object with query parameters
 * @param {Object} env - The environment variables
 * @returns {Promise<Response>} The upstream response
 */
function fetchFromTextApi(prompt, url, env) {
    // Get model from query parameter or use default
    const model = url.searchParams.get("model") || "openai-large";

    // Prepare headers with Bearer token
    const headers = {
        "Content-Type": "application/json",
    };

    // Add Authorization header if TEXT_API_TOKEN is available
    if (env.TEXT_API_TOKEN) {
        headers["Authorization"] = `Bearer ${env.TEXT_API_TOKEN}`;
    }

    return fetch("https://text.pollinations.ai/v1/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify({
            model,
            stream: true,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt },
            ],
        }),
    });
}

/**
 * Create a transformer that converts SSE format to raw HTML
 * @returns {TransformStream} The SSE to HTML transformer
 */
function createSseToHtmlTransformer() {
    return new TransformStream({
        start() {
            this.buf = "";
        },
        transform(chunk, ctrl) {
            this.buf += chunk;
            const lines = this.buf.split("\n");
            this.buf = lines.pop();
            for (let l of lines) {
                l = l.trim();
                if (!l || l === "data: [DONE]") continue;
                if (l.startsWith("data:")) l = l.slice(5).trim();
                try {
                    const html = JSON.parse(l).choices?.[0]?.delta?.content;
                    if (html) ctrl.enqueue(html);
                } catch {}
            }
        },
    });
}

/**
 * Create a transformer that buffers until <html> and stops after </html>
 * @returns {TransformStream} The HTML gate transformer
 */
function createHtmlGateTransformer() {
    return new TransformStream({
        start() {
            this.prefixBuf = "";
            this.afterOpen = false;
            this.done = false;
            this.tailBuf = "";
        },
        transform(chunk, ctrl) {
            if (this.done) return; // ignore the rest

            let text = chunk;
            if (!this.afterOpen) {
                this.prefixBuf += text;
                const lower = this.prefixBuf.toLowerCase();
                const idx = lower.indexOf("<html");
                if (idx === -1) return; // still waiting
                // found <html …>
                this.afterOpen = true;
                text = this.prefixBuf.slice(idx); // drop everything before it
                this.prefixBuf = null;
            }

            // already streaming; emit chunk
            ctrl.enqueue(text);

            // keep last few KB to look for closing tag
            this.tailBuf = (this.tailBuf + text).slice(-8192);
            if (this.tailBuf.toLowerCase().includes("</html>"))
                this.done = true; // stop further output
        },
    });
}
