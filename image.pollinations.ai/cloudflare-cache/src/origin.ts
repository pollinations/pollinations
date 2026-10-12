import type { Context } from "hono";
import { takeSlot } from "../../../shared/ip-slot.js";
import { words } from "./mature-words.ts";
import { type ImageParams, ImageParamsSchema, MODELS } from "./params.ts";

// The legacy image API that ran on the OVH VM (image.pollinations.ai/src on
// master: index.ts, createAndReturnImages.ts, feedListeners.ts, weftX402.ts
// and the shared ipQueue.js), answered in the Worker: same routes,
// parameters, gen request and responses. Generation goes to gen through the
// GEN service binding, billed to the GEN_API_KEY bridge key.

const GEN_ORIGIN = "https://gen.pollinations.ai";
// Any URL: the feed hub answers every fetch with the event stream
const FEED_URL = "https://feed-hub.invalid/";
const FREE_INTERVAL_MS = 45_000;
// Gen is asked for at least one megapixel, then resized to the asked size
const TARGET_PIXEL_COUNT = 1024 * 1024;
const BLOCKED_MODELS = ["nanobanana", "kontext", "gptimage", "seedream"];
// setCORSHeaders, on every VM response. The cache Worker's cors() sets its
// own Access-Control-Expose-Headers over the VM's.
export const VM_CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
        "Content-Type, X-PAYMENT, Payment-Signature",
};
const NO_STORE = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
};
const CROSSDOMAIN = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE cross-domain-policy SYSTEM "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd">
<cross-domain-policy>
  <allow-access-from domain="*" secure="false"/>
</cross-domain-policy>`;
const TRACKING_DATA = {
    actualModel: "sana",
    usage: { completionImageTokens: 1, totalTokenCount: 1 },
};

type Env = Cloudflare.Env & Record<string, any>;
type Step = { step: string; timestamp: number };
type Job = {
    request: Request;
    env: Env;
    ctx: ExecutionContext;
    url: URL;
    route: string;
    originalPrompt: string | number;
    safeParams: ImageParams;
    referrer?: string;
    requestId: string;
    timing: Step[];
};

// One JSON line per adapter failure, without URL, prompt, IP or headers
export const logFailure = (route: string, details: object) =>
    console.error(JSON.stringify({ adapter: "image", route, ...details }));

/**
 * A body without Content-Length, as node:http sent every response it wrote
 * with writeHead() first
 */
const chunked = (body: string | Uint8Array) =>
    new ReadableStream({
        start(controller) {
            controller.enqueue(
                typeof body === "string"
                    ? new TextEncoder().encode(body)
                    : body,
            );
            controller.close();
        },
    });

const vmResponse = (
    body: string | Uint8Array,
    status: number,
    headers: Record<string, string>,
) =>
    new Response(chunked(body), {
        status,
        headers: { ...VM_CORS, ...headers },
    });

/** Express's weak ETag: body length in hex and the start of its base64 SHA-1 */
export async function etag(bytes: ArrayBuffer | Uint8Array) {
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", bytes));
    const base64 = btoa(String.fromCharCode(...hash));
    return `W/"${bytes.byteLength.toString(16)}-${base64.slice(0, 27)}"`;
}

const HTML_ESCAPES = {
    '"': "&quot;",
    "&": "&amp;",
    "'": "&#39;",
    "<": "&lt;",
    ">": "&gt;",
};

/**
 * Express's finalhandler page (1.3.1, NODE_ENV=production), with the VM's
 * CORS and Express's X-Powered-By
 */
export function expressPage(status: number, message: string) {
    const text = message.replace(/["&'<>]/g, (char) => HTML_ESCAPES[char]);
    const body = `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Error</title>\n</head>\n<body>\n<pre>${text}</pre>\n</body>\n</html>\n`;
    return new Response(body, {
        status,
        headers: {
            ...VM_CORS,
            "X-Powered-By": "Express",
            "Content-Security-Policy": "default-src 'none'",
            "X-Content-Type-Options": "nosniff",
            "Content-Type": "text/html; charset=utf-8",
        },
    });
}

// encodeurl 2.0.0, which finalhandler applies to the path it shows
const encodeUrl = (url: string) =>
    url.replace(
        /(?:[^\x21\x23-\x3B\x3D\x3F-\x5F\x61-\x7A\x7C\x7E]|%(?:[^0-9A-Fa-f]|[0-9A-Fa-f][^0-9A-Fa-f]|$))+/g,
        encodeURI,
    );

/** preMiddleware's 404 for paths outside /prompt and /feed */
function notFound(pathname: string) {
    // Node's url.parse escaped these, which a Worker's URL keeps
    const path = pathname.replace(
        /['^|]/g,
        (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    const body = {
        error: "Not Found",
        message: "The requested endpoint was not found",
        path,
    };
    return vmResponse(JSON.stringify(body), 404, {
        "Content-Type": "application/json",
    });
}

/**
 * The VM's fixed routes: crossdomain.xml, /models, /about and /register.
 * Other paths the cache Worker passes unchanged get preMiddleware's 404.
 */
export function utility(method: string, pathname: string) {
    if (pathname === "/crossdomain.xml") {
        return vmResponse(CROSSDOMAIN, 200, {
            "Content-Type": "application/xml",
        });
    }
    if (pathname === "/models") {
        const names = Object.entries(MODELS)
            .filter(([, config]) => config.tier !== "nectar")
            .map(([name]) => name);
        return vmResponse(JSON.stringify(names), 200, NO_STORE);
    }
    if (pathname === "/about") {
        const details = Object.entries(MODELS).map(([name, config]) => ({
            name,
            tier: config.tier || "seed",
            enhance: config.enhance || false,
            maxSideLength: config.maxSideLength,
        }));
        return vmResponse(JSON.stringify(details), 200, NO_STORE);
    }
    if (pathname === "/register") {
        // GPU servers register with gen now: none are listed, none are taken
        const [status, body] =
            method === "GET"
                ? [200, []]
                : method === "POST"
                  ? [403, { success: false, message: "Unauthorized" }]
                  : [200, { success: false, message: "Method not allowed" }];
        // res.end() without writeHead: with Content-Length
        return new Response(JSON.stringify(body), {
            status,
            headers: { ...VM_CORS, ...NO_STORE },
        });
    }
    // The acme challenge too: TLS ends at Cloudflare
    return notFound(pathname);
}

/** registerFeedListener, public listeners only: a password is ignored */
export async function feed(env: Env, method: string, search: string) {
    // The VM never answered a HEAD; here it gets the headers alone
    const events =
        method === "HEAD"
            ? null
            : (await env.FEED_HUB.getByName("image").fetch(FEED_URL + search))
                  .body;
    return new Response(events, {
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
        },
    });
}

/** urldecode 1.0.1: decodeURIComponent, or the number -1 for a malformed % */
function urldecode(text: string): string | number {
    try {
        return decodeURIComponent(text);
    } catch {
        return -1;
    }
}

/** Removes control characters, keeping every other character */
const sanitizeString = (text: string) =>
    // biome-ignore lint/suspicious/noControlCharactersInRegex: the VM's rule
    text && text.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");

/** url.parse(url, true).query: a repeated key becomes an array */
function queryOf(url: URL) {
    const query = Object.create(null);
    for (const [key, value] of url.searchParams) {
        query[key] = key in query ? [].concat(query[key], value) : value;
    }
    return query;
}

/** The VM's isMature: a mature word, as a word or anywhere in the prompt */
const matureWords = new Set([...words, ...words.map((word) => `${word}s`)]);
function isMature(prompt: string) {
    const input = prompt.toLowerCase();
    const inputWords = input.replaceAll("_", " ").split(/\b/);
    if (inputWords.some((word) => matureWords.has(word))) return true;
    return words.some((word) => input.includes(word.toLowerCase()));
}

/** extractToken: the query, then Authorization or x-pollinations-token */
function tokenOf(url: URL, headers: Headers) {
    const query = url.searchParams.get("token");
    if (query) return query;
    for (const name of ["authorization", "x-pollinations-token"]) {
        const value = headers.get(name);
        if (value) {
            return (
                (name === "authorization"
                    ? value.replace(/^Bearer\s+/i, "")
                    : value) || null
            );
        }
    }
    return null;
}

const weftEnabled = (env: Env) =>
    Boolean(
        env.WEFT_SELLER_API_KEY &&
            env.WEFT_PAY_TO &&
            env.WEFT_NETWORK &&
            env.WEFT_FACILITATOR_URL,
    );

const step = (name: string): Step => ({ step: name, timestamp: Date.now() });
const relative = (timing: Step[]) =>
    timing.map((info) => ({
        ...info,
        timestamp: info.timestamp - timing[0].timestamp,
    }));

/** The VM's error JSON; timingInfo holds the steps this request reached */
function errorJson(
    job: Job,
    error: Error & { status?: number },
    queueInfo = null,
) {
    const status = error.status || 500;
    const errorType =
        status === 429 ? "Too Many Requests" : "Internal Server Error";
    const body = {
        error: errorType,
        message: error.message,
        debug: null,
        timingInfo: relative(job.timing),
        requestId: job.requestId,
        requestParameters: {
            prompt: job.originalPrompt,
            ...job.safeParams,
            referrer: job.referrer,
        },
        queueInfo,
    };
    return vmResponse(JSON.stringify(body), status, {
        "Content-Type": "application/json",
        "X-Error-Type": errorType,
    });
}

/**
 * checkCacheAndGenerate for a path under /prompt: parameters, blocked models,
 * the free limit, then a free generation or the paywall. `url` is the VM's
 * request URL, after the cache Worker's /prompt rewrite.
 */
export async function generate(c: Context, url: URL, route: string) {
    const request = c.req.raw;
    const { pathname } = url;
    if (!pathname.startsWith("/prompt")) return notFound(pathname);
    const job: Job = {
        request,
        env: c.env,
        ctx: c.executionCtx,
        url,
        route,
        originalPrompt: urldecode(
            pathname.split("/prompt/")[1] || "random_prompt",
        ),
        // A side over 2^53 throws here, outside the VM's try: that crashed
        // the process; here the Worker answers its 500
        safeParams: ImageParamsSchema.parse(queryOf(url)),
        referrer:
            request.headers.get("referer") ||
            request.headers.get("origin") ||
            undefined,
        requestId: Math.random().toString(36).substring(7),
        timing: [],
    };
    // The VM's in-memory cache key called replaceAll on the decoded prompt
    if (typeof job.originalPrompt !== "string") {
        return errorJson(
            job,
            new TypeError("prompt.replaceAll is not a function"),
        );
    }
    job.timing.push(step("Request received and queued."));
    const { model } = job.safeParams;
    if (BLOCKED_MODELS.includes(model)) {
        return errorJson(
            job,
            new Error(
                `${model} model is only available on enter.pollinations.ai. Visit https://enter.pollinations.ai/?ref=image to get started.`,
            ),
        );
    }

    const { env, ctx } = job;
    // A generation runs to its end even if the client leaves, as on the VM
    const background = (response: Promise<Response>) => {
        ctx.waitUntil(response);
        return response;
    };
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    let slot: Awaited<ReturnType<typeof takeSlot>>;
    try {
        // Without the paywall a request waits for the next slot, as on the VM
        slot = await takeSlot(
            env.IP_SLOT,
            ip,
            FREE_INTERVAL_MS,
            !weftEnabled(env),
        );
    } catch (error) {
        // The VM's in-memory queue could not fail: answer as a free request
        // that books and releases nothing
        logFailure(route, { error: "ip_slot", type: error.name });
        return background(generateImage(job, false, () => {}));
    }

    if (slot.action === "full") {
        const error = Object.assign(
            new Error(
                `Queue full for IP: ${ip}: 1 requests already queued (max: 1). Get unlimited access at https://enter.pollinations.ai`,
            ),
            { status: 429 },
        );
        const queueInfo = {
            ip,
            currentSize: 0,
            pending: 1,
            total: 1,
            maxAllowed: 1,
            username: null,
            userId: null,
            tier: "anonymous",
        };
        return errorJson(job, error, queueInfo);
    }
    if (slot.action === "pay") {
        // requireImagePayment ran checkCacheAndGenerate again for a paid or
        // HEAD request, outside the free limit
        const unpaid = () =>
            background(
                generateImage(
                    { ...job, timing: [step("Request received and queued.")] },
                    true,
                    () => {},
                ),
            );
        // Its Express route was GET only: a HEAD passed the payment
        // middleware, other methods got the router's 404
        if (request.method === "HEAD") return unpaid();
        if (request.method !== "GET") {
            return expressPage(
                404,
                `Cannot ${request.method} ${encodeUrl(pathname)}`,
            );
        }
        const { pay } = await import("./pay.ts");
        return pay(request, pathname, env, ctx, unpaid);
    }

    // go or wait: free the IP when the generation ends, even if the client
    // disconnects, as the VM's queue did
    let ended: () => void;
    const release = new Promise<void>((resolve) => {
        ended = resolve;
    }).then(() => env.IP_SLOT.getByName(ip).release(slot));
    ctx.waitUntil(
        release.catch((error) =>
            logFailure(route, { error: "ip_slot_release", type: error.name }),
        ),
    );
    return background(
        (async () => {
            if (slot.waitMs > 0) {
                await new Promise((resolve) =>
                    setTimeout(resolve, slot.waitMs),
                );
            }
            return generateImage(job, false, ended);
        })(),
    );
}

/**
 * callGenSana's request: the prompt and seed as given, the size scaled up to
 * at least a megapixel
 */
async function callGenSana(env: Env, prompt: string, params: ImageParams) {
    const { width, height, seed, safe } = params;
    let [scaledWidth, scaledHeight] = [width, height];
    if (width * height < TARGET_PIXEL_COUNT) {
        const factor = Math.sqrt(TARGET_PIXEL_COUNT / (width * height));
        scaledWidth = Math.round(width * factor);
        scaledHeight = Math.round(height * factor);
    }
    const url = new URL(`/image/${encodeURIComponent(prompt)}`, GEN_ORIGIN);
    url.searchParams.set("model", "sana");
    url.searchParams.set("width", String(scaledWidth));
    url.searchParams.set("height", String(scaledHeight));
    url.searchParams.set("seed", String(seed));
    url.searchParams.set("safe", String(safe));
    url.searchParams.set("private", "true");
    const response = await env.GEN.fetch(url, {
        headers: {
            Accept: "image/jpeg",
            Authorization: `Bearer ${env.GEN_API_KEY}`,
        },
    });
    if (!response.ok) {
        const errorBody = (await response.text()).slice(0, 500);
        throw Object.assign(
            new Error(
                `Gen Sana request failed with ${response.status}: ${errorBody}`,
            ),
            { genStatus: response.status },
        );
    }
    const image = new Uint8Array(await response.arrayBuffer());
    if (image.byteLength === 0) {
        throw new Error("Gen Sana returned an empty image");
    }
    return image;
}

/**
 * The queue job (imageGen and createAndReturnImageCached): gen, the branded
 * JPEG, the feed event, then the response. Never throws; calls ended() once
 * the job is done. A paid or HEAD job (`paid`) answered errors as
 * requireImagePayment's Express app did.
 */
async function generateImage(job: Job, paid: boolean, ended: () => void) {
    const { env, safeParams, timing } = job;
    try {
        timing.push(step("Start generating job"));
        timing.push(step("Start processing"));
        timing.push(step("Start prompt normalization and translation"));
        const prompt = sanitizeString(job.originalPrompt as string);
        timing.push(step("End prompt normalization and translation"));
        const image = await callGenSana(env, prompt, safeParams);
        // Loaded here so that cold starts serving cache hits skip photon
        const { brand } = await import("./brand.ts");
        const jpeg = brand(image, safeParams.width, safeParams.height, {
            prompt,
            originalPrompt: job.originalPrompt,
            ...safeParams,
            isMature: false,
            isChild: false,
            trackingData: TRACKING_DATA,
        });
        timing.push(step("Generation completed."));
        timing.push(step("Image returned"));
        publish(job, prompt);
        return imageResponse(job.originalPrompt as string, jpeg);
    } catch (error) {
        logFailure(
            job.route,
            error.genStatus
                ? { error: "gen", status: error.genStatus }
                : { error: "exception", type: error.name },
        );
        if (!paid) return errorJson(job, error);
        // requireImagePayment's handler, written with res.writeHead
        const body = { error: error.message || "Image generation failed" };
        return vmResponse(JSON.stringify(body), error.status || 500, {
            "Content-Type": "application/json",
            "X-Powered-By": "Express",
        });
    } finally {
        ended();
    }
}

/** The success headers, Content-Disposition from the prompt */
function imageResponse(originalPrompt: string, jpeg: Uint8Array) {
    const base = originalPrompt
        .slice(0, 100)
        .replace(/[^a-z0-9\s-]/gi, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase();
    return vmResponse(jpeg, 200, {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Auth-Status": "unauthenticated",
        "Content-Disposition": `inline; filename="${base || "generated-image"}.jpg"`,
        "X-Auth-Result": "NONE",
        "x-model-used": "sana",
        "x-usage-completion-image-tokens": "1",
        "x-usage-total-tokens": "1",
    });
}

/**
 * sendToFeedListeners for one generation with saveAsLastState: the VM's feed
 * event, kept for the replay; private and mature events reach no listener
 */
function publish(job: Job, prompt: string) {
    const { request, url, safeParams } = job;
    const token = tokenOf(url, request.headers);
    const event = {
        ...safeParams,
        concurrentRequests: 0,
        // req.url as the VM got it: the path and the full query
        imageURL: `https://image.pollinations.ai${url.href.slice(url.origin.length)}`,
        prompt,
        isChild: false,
        // sendToFeedListeners flagged a prompt with a mature word
        isMature: isMature(prompt),
        // isMature was undefined in it, so JSON leaves it out
        maturity: { isChild: false, trackingData: TRACKING_DATA },
        timingInfo: relative(job.timing),
        status: "end_generating",
        referrer: job.referrer,
        wasPimped: safeParams.enhance,
        nsfw: false,
        private: !!safeParams.nofeed,
        token: token && `${token.slice(0, 2)}...`,
    };
    const line =
        event.private || event.isMature
            ? null
            : `data: ${JSON.stringify(event)}\n\n`;
    job.ctx.waitUntil(
        job.env.FEED_HUB.getByName("image")
            .publish(line, true)
            .catch((error) =>
                logFailure(job.route, { error: "feed", type: error.name }),
            ),
    );
}
