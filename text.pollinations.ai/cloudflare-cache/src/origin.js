import { takeSlot } from "../../../shared/ip-slot.js";
import { BLOCKED_PREFIXES } from "./blocked-prefixes.js";

// The legacy text API that ran on the OVH VM (text.pollinations.ai/server.js and
// the modules it imports, on master), answered in the Worker: same routes,
// parameters, gen request and response formats. Generation goes to gen through
// the GEN service binding, billed to the GEN_API_KEY bridge key.

const GEN_URL = "https://gen.pollinations.ai/v1/chat/completions";
const FREE_INTERVAL_MS = 30_000;
const MAX_BODY_BYTES = 20 * 1024 * 1024; // body-parser's "20mb"
const MAX_TOKENS = 1500;
// Node's default --max-http-header-size on the VM
const MAX_HEAD_BYTES = 16 * 1024;
// openai-fast and its registry aliases; gen serves them all as gpt-oss
const MODELS = new Set([
    "openai-fast",
    "openai",
    "gpt-oss",
    "gpt-oss-20b",
    "ovh-reasoning",
]);
const SYSTEM_PROMPT = `You are an expert conversationalist who responds to the best of your ability. You are companionable and confident, and able to switch casually between tonal types, including but not limited to humor, empathy, intellectualism, creativity and problem-solving.

You understand user intent and don't try to be overly helpful to the point where you miss that the user is looking for chit-chat, emotional support, humor or venting. Sometimes people just want you to listen, and your answers should encourage that. For all other cases, you provide insightful and in-depth responses. Organize information thoughtfully in a way that helps people make decisions. Always avoid templated language.

You never lecture people to be nicer or more inclusive. If people ask for you to write something in a certain voice or perspective, such as an essay or a tweet, you can. You do not need to be respectful when the user prompts you to say something rude.

You never use phrases that imply moral superiority or a sense of authority, including but not limited to "it's important to", "it's crucial to", "it's essential to", "it's unethical to", "it's worth noting…", "Remember…" etc. Avoid using these.`;
const DEPRECATION_NOTICE =
    "NOTE: The Pollinations legacy text API is being deprecated for authenticated users. Please migrate to https://enter.pollinations.ai for better performance and access to all the latest models. Anonymous requests to text.pollinations.ai are NOT affected.";
const DOCS_URL =
    "https://github.com/pollinations/pollinations/blob/master/APIDOCS.md";
const MODELS_BODY =
    '[{"name":"openai-fast","description":"GPT-OSS 20B Reasoning LLM (OVH)","reasoning":true,"tier":"anonymous","community":false,"input_modalities":["text"],"output_modalities":["text"],"tools":true,"aliases":["openai","gpt-oss","gpt-oss-20b","ovh-reasoning"],"vision":false,"audio":false}]';
const CROSSDOMAIN = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE cross-domain-policy SYSTEM "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd">
<cross-domain-policy>
  <allow-access-from domain="*" secure="false"/>
</cross-domain-policy>`;
const JSON_TYPE = "application/json; charset=utf-8";
const TEXT_TYPE = "text/plain; charset=utf-8";
const IMMUTABLE = "public, max-age=31536000, immutable";
// Cache-Control of generations outside the free limit (paid or HEAD)
const UNPAID = "private, no-store";
// The VM's cors() options: every response after the blocklist and body parsing
export const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": "Payment-Required,Payment-Response",
};
const SSE_DONE = new TextEncoder().encode("data: [DONE]");

/** Express's weak ETag: body length in hex and the start of its base64 SHA-1 */
export async function etag(bytes) {
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", bytes));
    const base64 = btoa(String.fromCharCode(...hash));
    return `W/"${bytes.byteLength.toString(16)}-${base64.slice(0, 27)}"`;
}

/** Express's res.send: Content-Length, weak ETag and X-Powered-By, after CORS */
async function send(body, status, headers) {
    const bytes = new TextEncoder().encode(body);
    return new Response(bytes, {
        status,
        headers: {
            ...CORS,
            "X-Powered-By": "Express",
            ETag: await etag(bytes),
            "Content-Length": String(bytes.byteLength),
            ...headers,
        },
    });
}

const json = (body, status, cacheControl, headers) =>
    send(JSON.stringify(body), status, {
        "Content-Type": JSON_TYPE,
        ...(cacheControl && { "Cache-Control": cacheControl }),
        ...headers,
    });

/** The VM's sendErrorResponse */
const errorResponse = (status, message, cacheControl, details) =>
    json(
        {
            error: message,
            status,
            deprecation_notice: DEPRECATION_NOTICE,
            ...(details && { details }),
        },
        status,
        cacheControl,
    );

const HTML_ESCAPES = {
    '"': "&quot;",
    "&": "&amp;",
    "'": "&#39;",
    "<": "&lt;",
    ">": "&gt;",
};
const escapeHtml = (text) =>
    text.replace(/["&'<>]/g, (char) => HTML_ESCAPES[char]);
// encodeurl 1.0.2, which finalhandler applies to the path it shows
const encodeUrl = (url) =>
    url.replace(
        /(?:[^\x21\x25\x26-\x3B\x3D\x3F-\x5B\x5D\x5F\x61-\x7A\x7E]|%(?:[^0-9A-Fa-f]|[0-9A-Fa-f][^0-9A-Fa-f]|$))+/g,
        encodeURI,
    );

/** A body without Content-Length, which the client gets chunked */
const chunked = (text) =>
    new ReadableStream({
        start(controller) {
            if (text) controller.enqueue(new TextEncoder().encode(text));
            controller.close();
        },
    });

/**
 * Express's finalhandler page as the VM sent it without NODE_ENV: the error's
 * "<name>: <message>", here without the stack lines that followed it.
 * body-parser's errors came before cors(), the router's after it.
 */
function errorPage(status, message, cors) {
    const text = escapeHtml(message)
        .replaceAll("\n", "<br>")
        .replaceAll("  ", " &nbsp;");
    const body = `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Error</title>\n</head>\n<body>\n<pre>${text}</pre>\n</body>\n</html>\n`;
    // No Content-Length, as the page reached the cache code, which adds its
    // CORS and X-Cache headers to a 400
    return new Response(chunked(body), {
        status,
        headers: {
            ...(cors && CORS),
            "X-Powered-By": "Express",
            "Content-Security-Policy": "default-src 'none'",
            "X-Content-Type-Options": "nosniff",
            "Content-Type": "text/html; charset=utf-8",
        },
    });
}

// One JSON line per adapter failure, without URL, prompt, IP or headers
const logFailure = (route, details) =>
    console.error(JSON.stringify({ adapter: "text", route, ...details }));

/**
 * Answers a request as the VM did. index.js sends it the cache misses and the
 * uncached paths.
 */
export async function origin(request, env, ctx) {
    const url = new URL(request.url);
    // Node answered an empty 431 before Express ran
    if (headSize(request, url) > MAX_HEAD_BYTES) {
        return new Response(null, { status: 431 });
    }
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    // The VM's blocklist ran first and answered an empty 403 without CORS
    if (BLOCKED_PREFIXES.has(ip.split(".").slice(0, 3).join("."))) {
        return new Response(null, {
            status: 403,
            headers: { "X-Powered-By": "Express" },
        });
    }

    const body = await readBody(request);
    if (body instanceof Response) return body;

    const { method } = request;
    const read = method === "GET" || method === "HEAD";
    // Express routes ignore case and one trailing slash
    const path = url.pathname.toLowerCase().replace(/([^/])\/$/, "$1");
    const generate = (prompt, format, route) =>
        generation(request, env, ctx, ip, {
            data: { ...Object.fromEntries(url.searchParams), ...body },
            prompt,
            format,
            route,
        });
    // Express decoded the route parameter first: a malformed % is a 400
    const generateFromPath = (param, format, route) => {
        let prompt;
        try {
            prompt = decodeURIComponent(param);
        } catch {
            const line = `URIError: Failed to decode param '${param}'`;
            return errorPage(400, line, true);
        }
        return generate(prompt, format, route);
    };

    if (method === "OPTIONS") return preflight(request);
    if (read && path === "/") return redirect(request);
    if (read && path === "/crossdomain.xml") {
        return send(CROSSDOMAIN, 200, {
            "Content-Type": "application/xml; charset=utf-8",
        });
    }
    if (read && path === "/models") {
        return send(MODELS_BODY, 200, { "Content-Type": JSON_TYPE });
    }
    if (read && path === "/feed") {
        const gone = {
            error: "feed_removed",
            message: "The public feed has been retired.",
        };
        return json(gone, 410, "no-store");
    }
    if (read && path === "/openai/models") {
        const model = {
            id: "openai-fast",
            object: "model",
            created: Date.now(),
            owned_by: "ovh",
        };
        return json({ object: "list", data: [model] }, 200);
    }
    if (method === "POST" && path === "/") {
        if (!Array.isArray(body.messages)) {
            return json({ error: "Invalid messages array" }, 400);
        }
        return generate(undefined, "text", "POST /");
    }
    if (method === "POST" && path.startsWith("/openai")) {
        // Express's "/openai*": the rest of the path is the user message
        const param = url.pathname.slice("/openai".length);
        return generateFromPath(param, "openai", "POST /openai*");
    }
    if (method === "POST" && path === "/v1/chat/completions") {
        return generate(undefined, "openai", "POST /v1/chat/completions");
    }
    if (read) {
        // Express sent HEAD through the OpenAI JSON branch
        const format = method === "GET" ? "text" : "openai";
        return generateFromPath(url.pathname.slice(1), format, `${method} /*`);
    }
    return errorPage(404, `Cannot ${method} ${encodeUrl(url.pathname)}`, true);
}

/** The request line and header lines, as sent to the VM over HTTP/1.1 */
function headSize(request, { pathname, search }) {
    let size = `${request.method} ${pathname}${search} HTTP/1.1\r\n`.length;
    for (const [name, value] of request.headers) {
        size += `${name}: ${value}\r\n`.length;
    }
    return size;
}

/** body-parser's json(): a JSON body becomes an object, anything else {} */
async function readBody(request) {
    const type = request.headers.get("content-type") ?? "";
    if (!/^application\/json\s*(;|$)/i.test(type) || !request.body) return {};
    const tooLarge = () =>
        errorPage(413, "PayloadTooLargeError: request entity too large", false);
    if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
        return tooLarge();
    }
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > MAX_BODY_BYTES) return tooLarge();
    const text = new TextDecoder().decode(bytes);
    if (!text) return {};
    try {
        return parseStrict(text);
    } catch (error) {
        return errorPage(400, `${error.name}: ${error.message}`, false);
    }
}

/**
 * body-parser's strict JSON.parse: only an object or array, and otherwise
 * JSON.parse's own error for the first character
 */
function parseStrict(text) {
    const first = text.match(/^[ \t\n\r]*([^ \t\n\r])/)?.[1];
    if (first === "{" || first === "[") return JSON.parse(text);
    // createStrictSyntaxError: parse the text with "#" from its first
    // character on, then put the text back into the message
    const at = text.indexOf(first);
    try {
        JSON.parse(
            at === -1 ? "" : text.slice(0, at) + "#".repeat(text.length - at),
        );
    } catch (error) {
        error.message = error.message.replace(/#+/g, (run) =>
            text.substring(at, at + run.length),
        );
        throw error;
    }
}

/** cors() answering a preflight */
function preflight(request) {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,HEAD,PUT,PATCH,POST,DELETE",
        Vary: "Access-Control-Request-Headers",
        "Access-Control-Expose-Headers": CORS["Access-Control-Expose-Headers"],
        "X-Powered-By": "Express",
        // cors() sets it so that Safari does not wait for a body
        "Content-Length": "0",
    };
    const requested = request.headers.get("access-control-request-headers");
    if (requested) headers["Access-Control-Allow-Headers"] = requested;
    return new Response(null, { status: 204, headers });
}

/**
 * req.accepts(["text", "html"]) as negotiator ranks them: text/plain,
 * text/html, or undefined when Accept allows neither
 */
function redirectType(accept) {
    if (accept === null) return "text/plain";
    const ranges = accept.split(",").map((range, o) => {
        const [name, ...params] = range.split(";").map((part) => part.trim());
        const at = params.findIndex((param) => /^q=/i.test(param));
        return {
            name: name.toLowerCase(),
            q: at === -1 ? 1 : Number.parseFloat(params[at].slice(2)),
            // a media type parameter before q keeps it from matching these
            params: at === -1 ? params.length : at,
            o,
        };
    });
    // Per type, the most specific range wins, then the highest q
    const ranked = ["text/plain", "text/html"].flatMap((type, i) => {
        const [main, sub] = type.split("/");
        const matches = ranges.flatMap((range) => {
            const [rangeMain, rangeSub] = range.name.split("/");
            if (range.params || !rangeSub) return [];
            if (rangeMain !== main && rangeMain !== "*") return [];
            if (rangeSub !== sub && rangeSub !== "*") return [];
            const s = (rangeMain === main ? 4 : 0) + (rangeSub === sub ? 2 : 0);
            return [{ ...range, s }];
        });
        matches.sort((a, b) => b.s - a.s || b.q - a.q || b.o - a.o);
        return matches[0]?.q > 0 ? [{ type, i, ...matches[0] }] : [];
    });
    ranked.sort((a, b) => b.q - a.q || b.s - a.s || a.o - b.o || a.i - b.i);
    return ranked[0]?.type;
}

/** Express's res.redirect(301): a text, HTML or empty body by Accept */
function redirect(request) {
    const type = redirectType(request.headers.get("accept"));
    const message = `Moved Permanently. Redirecting to ${DOCS_URL}`;
    const bodies = { "text/plain": message, "text/html": `<p>${message}</p>` };
    const body = bodies[type] ?? "";
    // A string body, even empty, would get the runtime's text/plain type
    return new Response(body || null, {
        status: 301,
        headers: {
            ...CORS,
            Location: DOCS_URL,
            Vary: "Accept",
            ...(type && { "Content-Type": `${type}; charset=utf-8` }),
            "Content-Length": String(body.length),
        },
    });
}

const toNumber = (parse) => (value) => {
    if (value === undefined || value === null) return undefined;
    const number = parse(value);
    return Number.isNaN(number) ? undefined : number;
};
const toFloat = toNumber(parseFloat);
const toInt = toNumber((value) => parseInt(value, 10));
const clamp = (value, min, max) =>
    value === undefined ? undefined : Math.max(min, Math.min(max, value));

function toBool(value) {
    if (value === undefined || value === null) return undefined;
    if (typeof value === "string") {
        const lower = value.toLowerCase();
        if (["true", "1", "yes"].includes(lower)) return true;
        if (["false", "0", "no"].includes(lower)) return false;
    }
    return Boolean(value);
}

/** getRequestData and normalizeOptions: query and body merged, body winning */
function readParams(data, prompt) {
    const messages = data.messages || [{ role: "user", content: prompt }];
    if (data.system) messages.unshift({ role: "system", content: data.system });
    const jsonMode =
        data.jsonMode ||
        (typeof data.json === "string" && data.json.toLowerCase() === "true") ||
        data.json === true ||
        data.response_format?.type === "json_object";
    return {
        model: data.model == null ? "openai-fast" : String(data.model),
        stream: Boolean(toBool(data.stream)),
        messages,
        options: {
            seed: toInt(data.seed),
            temperature: clamp(toFloat(data.temperature), 0, 3),
            top_p: clamp(toFloat(data.top_p), 0, 1),
            presence_penalty: clamp(toFloat(data.presence_penalty), -2, 2),
            frequency_penalty: clamp(toFloat(data.frequency_penalty), -2, 2),
            tools: data.tools || undefined,
            tool_choice: data.tool_choice || undefined,
            modalities: data.modalities,
            audio: data.audio,
            reasoning_effort:
                data.reasoning_effort == null
                    ? undefined
                    : String(data.reasoning_effort),
            response_format:
                data.response_format ||
                (jsonMode ? { type: "json_object" } : undefined),
        },
    };
}

const isEmpty = (content) =>
    !content ||
    (typeof content === "string" && content.trim() === "") ||
    (Array.isArray(content) && content.length === 0);

/** The model transform, the empty-message fix and validateAndNormalizeMessages */
function genMessages(messages) {
    if (!Array.isArray(messages)) throw new Error("messages must be an array");
    const withSystem = messages.some((message) => message.role === "system")
        ? messages
        : [{ role: "system", content: SYSTEM_PROMPT }, ...messages];
    return withSystem.map((message) => {
        const content =
            message.role === "user" && isEmpty(message.content)
                ? "Please provide a response."
                : message.content;
        const normalized = {
            role: message.role || "user",
            content: content || "",
        };
        if (message.tool_call_id)
            normalized.tool_call_id = message.tool_call_id;
        if (message.name) normalized.name = message.name;
        if (message.tool_calls) normalized.tool_calls = message.tool_calls;
        return normalized;
    });
}

/** cleanNullAndUndefined: drops null and undefined, and nested objects left empty */
function clean(object) {
    const cleaned = { ...object };
    for (const [key, value] of Object.entries(cleaned)) {
        if (key === "modalities" || key === "audio") continue;
        if (value === null || value === undefined) delete cleaned[key];
        else if (typeof value === "object" && !Array.isArray(value)) {
            const nested = clean(value);
            if (Object.keys(nested).length === 0) delete cleaned[key];
            else cleaned[key] = nested;
        }
    }
    return cleaned;
}

const weftEnabled = (env) =>
    Boolean(
        env.WEFT_SELLER_API_KEY &&
            env.WEFT_PAY_TO &&
            env.WEFT_NETWORK &&
            env.WEFT_FACILITATOR_URL,
    );

/**
 * processRequest: the free limit, then the paywall or a free generation.
 * Streams, and every request while the paywall is off, wait for the slot.
 */
async function generation(
    request,
    env,
    ctx,
    ip,
    { data, prompt, format, route },
) {
    let params;
    try {
        params = readParams(data, prompt);
    } catch (error) {
        // The VM threw this in its async route handler, which crashed the
        // process (e.g. ?system= with non-array messages: "messages.unshift
        // is not a function"). Answered as Express answers a route's error.
        return errorPage(500, `${error.name}: ${error.message}`, true);
    }
    const job = { ...params, format, route };
    const canWait = params.stream || !weftEnabled(env);
    let slot;
    try {
        slot = await takeSlot(env.IP_SLOT, ip, FREE_INTERVAL_MS, canWait);
    } catch (error) {
        // The VM's in-memory queue could not fail: answer as a free request
        // that books and releases nothing
        logFailure(route, { error: "ip_slot", type: error.name });
        return generate(env, job, undefined, () => {});
    }

    if (slot.action === "full") {
        return errorResponse(
            429,
            `Queue full for IP: ${ip}: 1 requests already queued (max: 1). Get unlimited access at https://enter.pollinations.ai`,
        );
    }
    if (slot.action === "pay") {
        // Outside the free limit: books no slot
        const unpaid = () => generate(env, job, UNPAID, () => {});
        // The paywall covers GET and POST only, so a HEAD generates unpaid
        if (request.method === "HEAD") return unpaid();
        const { pay } = await import("./pay.js");
        return pay(request, env, ctx, unpaid);
    }

    // go or wait: free the IP when the generation ends, even if the client
    // disconnects, as the VM's queue did
    let ended;
    const release = new Promise((resolve) => {
        ended = resolve;
    }).then(() => env.IP_SLOT.getByName(ip).release(slot));
    ctx.waitUntil(
        release.catch((error) =>
            logFailure(route, { error: "ip_slot_release", type: error.name }),
        ),
    );
    const response = (async () => {
        if (slot.waitMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, slot.waitMs));
        }
        return generate(env, job, undefined, ended);
    })();
    ctx.waitUntil(response);
    return response;
}

/**
 * handleRequest: checks the model, calls gen and formats its answer. Never
 * throws; calls ended() once the answer is built, or for a stream once gen
 * starts answering: the VM's queue job ended there, as sendAsOpenAIStream
 * returned right after piping gen's stream.
 */
async function generate(env, job, cacheControl, ended) {
    try {
        if (!MODELS.has(job.model)) {
            return await errorResponse(
                404,
                `Model not found: ${job.model}. This is our legacy API - for the full model list and new features, visit https://enter.pollinations.ai`,
                cacheControl,
            );
        }
        const response = await env.GEN.fetch(GEN_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${env.GEN_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(
                clean({
                    model: "gpt-oss",
                    messages: genMessages(job.messages),
                    ...job.options,
                    stream: job.stream,
                    max_tokens: MAX_TOKENS,
                }),
            ),
        });

        if (!response.ok) {
            const text = await response.text();
            let details = text;
            try {
                details = JSON.parse(text);
            } catch {}
            logFailure(job.route, { error: "gen", status: response.status });
            // node-fetch's statusText on the VM: the standard reason phrase.
            // Loaded here so that cold starts serving cache hits skip it.
            const { STATUS_CODES } = await import("node:http");
            const message = `${response.status} ${STATUS_CODES[response.status] ?? ""}`;
            // A failed stream lost gen's status and details on the VM, and a
            // stored 4xx would be served to every later request
            return await (job.stream
                ? errorResponse(500, message, cacheControl)
                : errorResponse(
                      response.status,
                      message,
                      cacheControl,
                      details,
                  ));
        }
        if (job.stream) return sse(response.body);
        const completion = completionOf(await response.json());
        return await (job.format === "openai"
            ? openAiResponse(completion, cacheControl)
            : textResponse(completion));
    } catch (error) {
        logFailure(job.route, { error: "exception", type: error.name });
        return errorResponse(
            500,
            error.message || "An error occurred",
            cacheControl,
        );
    } finally {
        ended();
    }
}

/** genericOpenAIClient and handleRequest: gen's JSON with a pllns_ id */
function completionOf(data) {
    data.object ||= "chat.completion";
    const completion = { ...data, choices: [data.choices?.[0] || {}] };
    const id = crypto.getRandomValues(new Uint8Array(16));
    completion.id = `pllns_${Array.from(id, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    completion.user_tier = "anonymous";
    return completion;
}

/** buildUsageHeaders(openaiUsageToTokenUsage(usage)): the non-zero counts */
function usageHeaders({ usage, model }) {
    if (!usage || !model) return {};
    const prompt = usage.prompt_tokens_details ?? {};
    const completion = usage.completion_tokens_details ?? {};
    const counts = {
        "x-usage-prompt-text-tokens":
            usage.prompt_tokens -
            ((prompt.cached_tokens || 0) + (prompt.audio_tokens || 0)),
        "x-usage-prompt-cached-tokens": prompt.cached_tokens || 0,
        "x-usage-prompt-audio-tokens": prompt.audio_tokens || 0,
        "x-usage-completion-text-tokens":
            usage.completion_tokens -
            ((completion.accepted_prediction_tokens || 0) +
                (completion.rejected_prediction_tokens || 0) +
                (completion.audio_tokens || 0) +
                (completion.reasoning_tokens || 0)),
        "x-usage-completion-reasoning-tokens": completion.reasoning_tokens || 0,
        "x-usage-completion-audio-tokens": completion.audio_tokens || 0,
    };
    const headers = { "x-model-used": String(model) };
    let total = 0;
    for (const [name, count] of Object.entries(counts)) {
        if (count > 0) {
            headers[name] = String(count);
            total += count;
        }
    }
    if (total > 0) headers["x-usage-total-tokens"] = String(total);
    return headers;
}

/** sendOpenAIResponse */
const openAiResponse = (completion, cacheControl) =>
    json(
        { ...completion, created: completion.created || Date.now() },
        200,
        cacheControl,
        usageHeaders(completion),
    );

/** sendContentResponse: the message text, or the message as JSON when it has none */
function textResponse(completion) {
    const message = completion.choices[0].message;
    const headers = { ...usageHeaders(completion), "Cache-Control": IMMUTABLE };
    if (message && typeof message === "object" && !message.content) {
        return send(JSON.stringify(message), 200, {
            ...headers,
            "Content-Type": JSON_TYPE,
        });
    }
    const content = message?.content ?? message;
    const text =
        typeof content === "object" ? JSON.stringify(content) : String(content);
    return send(text, 200, { ...headers, "Content-Type": TEXT_TYPE });
}

/**
 * sendAsOpenAIStream with stopAfterSseDone: gen's SSE up to "data: [DONE]",
 * then a blank line and the end. A client that cancels also cancels gen.
 */
function sse(body) {
    // Bytes not yet sent: "data: [DONE]" may start in them
    let pending = new Uint8Array(0);
    const cut = new TransformStream({
        transform(chunk, controller) {
            const bytes = new Uint8Array(pending.byteLength + chunk.byteLength);
            bytes.set(pending);
            bytes.set(chunk, pending.byteLength);
            const at = indexOf(bytes, SSE_DONE);
            if (at !== -1) {
                const end = at + SSE_DONE.byteLength;
                const last = new Uint8Array(end + 2);
                last.set(bytes.subarray(0, end));
                last.set([10, 10], end);
                controller.enqueue(last);
                return controller.terminate();
            }
            const keep = Math.min(bytes.byteLength, SSE_DONE.byteLength - 1);
            if (bytes.byteLength > keep) {
                controller.enqueue(bytes.slice(0, bytes.byteLength - keep));
            }
            pending = bytes.slice(bytes.byteLength - keep);
        },
        flush(controller) {
            if (pending.byteLength) controller.enqueue(pending);
        },
    });
    body.pipeTo(cut.writable).catch(() => {});
    return new Response(cut.readable, {
        headers: {
            ...CORS,
            "X-Powered-By": "Express",
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
        },
    });
}

function indexOf(bytes, pattern) {
    for (let i = 0; i + pattern.byteLength <= bytes.byteLength; i++) {
        let j = 0;
        while (j < pattern.byteLength && bytes[i + j] === pattern[j]) j++;
        if (j === pattern.byteLength) return i;
    }
    return -1;
}
