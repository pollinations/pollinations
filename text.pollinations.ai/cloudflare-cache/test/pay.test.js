import {
    createExecutionContext,
    env,
    fetchMock,
    runInDurableObject,
    waitOnExecutionContext,
} from "cloudflare:test";
import { afterEach, beforeAll, expect, test, vi } from "vitest";
import { MAX_HOLD_MS } from "../../../shared/ip-slot.js";
import worker, { generateCacheKey } from "../src/index.js";
import browserBody from "./fixtures/text.pollinations.ai-get-browser.body?raw";
import browserHeaders from "./fixtures/text.pollinations.ai-get-browser.headers?raw";
import jsonChallenge from "./fixtures/text.pollinations.ai-get-json.challenge?raw";
import jsonHeaders from "./fixtures/text.pollinations.ai-get-json.headers?raw";
import headHeaders from "./fixtures/text.pollinations.ai-head-json.headers?raw";
import openAiHeaders from "./fixtures/text.pollinations.ai-post-openai-json.headers?raw";
import vm404 from "./fixtures/vm-unknown-model-404.body?raw";

// Live 402 captures from the VM (2026-10-11) and the paths they were taken on
const CAPTURED_JSON =
    "/weftbaseline-1791750377-b%20reply%20with%20the%20word%20ok";
const CAPTURED_BROWSER =
    "/weftbaseline-1791750377-c%20reply%20with%20the%20word%20ok";
const CAPTURED_HEAD =
    "/weftbaseline-1791750377-h%20reply%20with%20the%20word%20ok";
const CURL = { accept: "application/json", "user-agent": "curl/8.7.1" };
const BROWSER = {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
};
/** A JSON POST as clients send it, with its Content-Length */
const jsonPost = (body) => {
    const text = JSON.stringify(body);
    return {
        method: "POST",
        headers: {
            ...CURL,
            "content-type": "application/json",
            "content-length": String(text.length),
        },
        body: text,
    };
};

// A stub facilitator: fetchMock answers /supported, /verify and /settle
const FACILITATOR = "https://x402.weft.network";
const PAYER = `0x${"ab".repeat(20)}`;
const SETTLED = {
    success: true,
    payer: PAYER,
    transaction: `0x${"cd".repeat(32)}`,
    network: "eip155:8453",
};
const reply = (statusCode, body) => ({
    statusCode,
    data: typeof body === "string" ? body : JSON.stringify(body),
});
const STUB_REPLIES = {
    "/supported": () =>
        reply(200, {
            kinds: [
                { x402Version: 2, scheme: "exact", network: "eip155:8453" },
            ],
            extensions: [],
            signers: {},
        }),
    "/verify": () => reply(200, { isValid: true, payer: PAYER }),
    "/settle": () => reply(200, SETTLED),
};
let replies = { ...STUB_REPLIES };
// Facilitator paths and "gen", in the order they were called
const events = [];
const supportedHeaders = [];

beforeAll(() => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
    const facilitator = fetchMock.get(FACILITATOR);
    for (const [path, method] of [
        ["/supported", "GET"],
        ["/verify", "POST"],
        ["/settle", "POST"],
    ]) {
        const scope = facilitator
            .intercept({ path, method })
            .reply((options) => {
                events.push(path);
                if (path === "/supported") {
                    supportedHeaders.push(new Headers(options.headers));
                }
                return replies[path]();
            });
        // A slow /supported lets concurrent first requests share its sync
        if (path === "/supported") scope.delay(50);
        scope.persist();
    }
});

afterEach(() => {
    replies = { ...STUB_REPLIES };
    events.length = 0;
});

let lastIp = 0;
const nextIp = () => `203.0.113.${++lastIp}`;

// gen through the fixed responses in vitest.config.js, recorded in events
const testEnv = {
    ...env,
    GEN: {
        fetch: (url, init) => {
            events.push("gen");
            return env.GEN.fetch(url, init);
        },
    },
};

/** Calls the Worker as the edge would, reads the body, then waits for its background work */
async function call(
    path,
    {
        ip,
        host = "text.pollinations.ai",
        method,
        headers,
        body,
        app = worker,
    } = {},
) {
    const ctx = createExecutionContext();
    const request = new Request(`https://${host}${path}`, {
        method,
        body,
        headers: { "cf-connecting-ip": ip, ...headers },
    });
    const response = await app.fetch(request, testEnv, ctx);
    const text = await response.text();
    await waitOnExecutionContext(ctx);
    return { response, text };
}

/** A capture's headers, without the ones the edge adds */
function capturedHeaders(raw) {
    const edge = ["date", "cf-ray", "cf-cache-status", "server"];
    const lines = raw.trim().split(/\r?\n/).slice(1);
    const pairs = lines.map((line) => {
        const at = line.indexOf(":");
        return [line.slice(0, at).toLowerCase(), line.slice(at + 1).trim()];
    });
    return new Map(pairs.filter(([name]) => !edge.includes(name)));
}

/** An IP whose free generation is running, as IpSlot stores it */
async function limitedIp() {
    const ip = nextIp();
    await runInDurableObject(env.IP_SLOT.getByName(ip), (_slot, state) =>
        state.storage.setAlarm(Date.now() + MAX_HOLD_MS),
    );
    return ip;
}

const alarmOf = (ip) =>
    runInDurableObject(env.IP_SLOT.getByName(ip), (_slot, state) =>
        state.storage.getAlarm(),
    );

const storedAt = async (path) =>
    env.TEXT_BUCKET.head(
        await generateCacheKey(
            new Request(`https://text.pollinations.ai${path}`),
        ),
    );

/** A PAYMENT-SIGNATURE for a challenge; the stub facilitator accepts any signature */
function paymentFor(paymentRequired) {
    const challenge = JSON.parse(atob(paymentRequired));
    const accepted = challenge.accepts[0];
    const authorization = {
        from: PAYER,
        to: accepted.payTo,
        value: accepted.amount,
        validAfter: "0",
        validBefore: "9999999999",
        nonce: `0x${"22".repeat(32)}`,
    };
    const payload = { signature: `0x${"11".repeat(65)}`, authorization };
    return btoa(
        JSON.stringify({
            x402Version: 2,
            resource: challenge.resource,
            accepted,
            payload,
        }),
    );
}

/** A 402 for path, then the same request paid */
async function payFor(path, options) {
    const ip = await limitedIp();
    const challenge = await call(path, { ip, ...options });
    expect(challenge.response.status).toBe(402);
    events.length = 0;
    const signature = paymentFor(
        challenge.response.headers.get("payment-required"),
    );
    return call(path, {
        ...options,
        ip,
        headers: { ...options?.headers, "payment-signature": signature },
    });
}

test("the JSON 402 matches the VM's capture byte for byte, on both hosts and with any query", async () => {
    const vm = Object.fromEntries(capturedHeaders(jsonHeaders));

    for (const host of ["text.pollinations.ai", "text.myceli.ai"]) {
        const { response, text } = await call(
            `${CAPTURED_JSON}?token=secret&referrer=app`,
            { ip: await limitedIp(), host, headers: CURL },
        );

        expect(response.status).toBe(402);
        expect(text).toBe("{}");
        const headers = Object.fromEntries(response.headers);
        expect(headers["x-legacy-path"]).toBe("worker");
        delete headers["x-legacy-path"];
        expect(headers).toEqual(vm);
    }
    // The challenge names the VM's origin host and path, without the query
    const challenge = JSON.parse(atob(vm["payment-required"]));
    expect(challenge).toEqual(JSON.parse(jsonChallenge));
    expect(challenge.resource.url).toBe(
        `https://text-origin.pollinations.ai${CAPTURED_JSON}`,
    );
});

test("the facilitator sees the VM's seller identity, once per isolate", async () => {
    await call("/identity", { ip: await limitedIp(), headers: CURL });

    expect(supportedHeaders).toHaveLength(1);
    const [headers] = supportedHeaders;
    expect(headers.get("authorization")).toBe("Bearer test-seller-key");
    expect(headers.get("user-agent")).toBe("weft-sdk-express/0.27.1");
    const declared = JSON.stringify({
        name: "Pollinations legacy text",
        type: "api",
        tags: ["text"],
    });
    expect(headers.get("x-weft-declared")).toBe(
        btoa(declared)
            .replaceAll("+", "-")
            .replaceAll("/", "_")
            .replace(/=+$/, ""),
    );
});

test("POST /openai gets the VM's challenge", async () => {
    const { response, text } = await call("/openai", {
        ip: await limitedIp(),
        ...jsonPost({ messages: [{ role: "user", content: "hi" }] }),
    });

    expect(response.status).toBe(402);
    expect(text).toBe("{}");
    expect(response.headers.get("payment-required")).toBe(
        capturedHeaders(openAiHeaders).get("payment-required"),
    );
});

test("browsers get the VM's paywall page byte for byte", async () => {
    const { response, text } = await call(CAPTURED_BROWSER, {
        ip: await limitedIp(),
        headers: BROWSER,
    });

    expect(response.status).toBe(402);
    expect(text).toBe(browserBody);
    const vm = capturedHeaders(browserHeaders);
    for (const name of [
        "content-type",
        "cache-control",
        "access-control-allow-origin",
        "access-control-expose-headers",
        "payment-required",
        "x-powered-by",
    ]) {
        expect(response.headers.get(name), name).toBe(vm.get(name));
    }
});

test("only an HTML Accept from a Mozilla user agent gets the page", async () => {
    for (const headers of [
        { accept: "text/html", "user-agent": "curl/8.7.1" },
        { accept: "*/*", "user-agent": "Mozilla/5.0" },
        { accept: "image/*", "user-agent": "Mozilla/5.0" },
    ]) {
        const { response, text } = await call("/not%20a%20browser", {
            ip: await limitedIp(),
            headers,
        });

        expect(response.headers.get("content-type")).toBe(
            "application/json; charset=utf-8",
        );
        expect(text).toBe("{}");
    }
});

test("a rate-limited HEAD generates unpaid without booking the slot, as on the VM", async () => {
    const ip = await limitedIp();
    const hold = await alarmOf(ip);

    const { response } = await call(CAPTURED_HEAD, {
        ip,
        method: "HEAD",
        headers: CURL,
    });

    expect(response.status).toBe(200);
    const vm = capturedHeaders(headHeaders);
    for (const name of [
        "content-type",
        "cache-control",
        "access-control-allow-origin",
        "access-control-expose-headers",
        "link",
        "x-pollinations-logo",
        "x-powered-by",
        "x-model-used",
    ]) {
        expect(response.headers.get(name), name).toBe(vm.get(name));
    }
    expect(response.headers.get("payment-required")).toBeNull();
    expect(events).toEqual(["gen"]);
    expect(await alarmOf(ip)).toBe(hold);
    expect(await storedAt(CAPTURED_HEAD)).toBeNull();
});

test("an unknown model books the free slot and gets the VM's 404; then the IP gets 402s", async () => {
    const ip = nextIp();

    const free = await call("/check?model=zz-nonexistent-model", {
        ip,
        headers: CURL,
    });
    expect(free.response.status).toBe(404);
    expect(free.text).toBe(vm404);

    const next = await call("/check%202", { ip, headers: CURL });
    expect(next.response.status).toBe(402);
    const unknown = await call("/check%203?model=zz-nonexistent-model", {
        ip,
        headers: CURL,
    });
    expect(unknown.response.status).toBe(402);
});

test("X-PAYMENT alone gets a fresh 402 without a /verify call", async () => {
    const { response } = await call("/x%20payment", {
        ip: await limitedIp(),
        headers: { ...CURL, "x-payment": "anything" },
    });

    expect(response.status).toBe(402);
    expect(events).not.toContain("/verify");
});

test("a payment header is ignored while the slot is free, and on a cache hit", async () => {
    const free = await call("/free%20with%20a%20payment", {
        ip: nextIp(),
        headers: { "payment-signature": "anything" },
    });
    expect(free.response.status).toBe(200);
    expect(free.text).toBe("ok");
    expect(await storedAt("/free%20with%20a%20payment")).toBeNull();

    await call("/cached%20before%20a%20payment", { ip: nextIp() });
    const hit = await call("/cached%20before%20a%20payment", {
        ip: await limitedIp(),
        headers: { "payment-signature": "anything" },
    });
    expect(hit.response.headers.get("x-cache")).toBe("HIT");
    expect(events).not.toContain("/verify");
});

test("a paid GET verifies, generates, then settles; it is private and never stored", async () => {
    const paid = await payFor("/paid%20get", { headers: CURL });

    expect(paid.response.status).toBe(200);
    expect(paid.text).toBe("ok");
    expect(events).toEqual(["/verify", "gen", "/settle"]);
    expect(
        JSON.parse(atob(paid.response.headers.get("payment-response"))),
    ).toEqual(SETTLED);
    expect(paid.response.headers.get("cache-control")).toBe(
        "public, max-age=31536000, immutable, private",
    );
    expect(paid.response.headers.get("x-powered-by")).toBe("Pollinations.AI");
    expect(await storedAt("/paid%20get")).toBeNull();
});

test("a paid generation leaves the IP's slot as it was", async () => {
    const ip = await limitedIp();
    const hold = await alarmOf(ip);
    const challenge = await call("/paid%20slot", { ip, headers: CURL });
    const signature = paymentFor(
        challenge.response.headers.get("payment-required"),
    );

    await call("/paid%20slot", {
        ip,
        headers: { ...CURL, "payment-signature": signature },
    });

    expect(await alarmOf(ip)).toBe(hold);
});

test("a paid POST /openai stays private, no-store", async () => {
    const paid = await payFor(
        "/openai",
        jsonPost({ messages: [{ role: "user", content: "paid" }] }),
    );

    expect(paid.response.status).toBe(200);
    expect(paid.response.headers.get("cache-control")).toBe(
        "private, no-store",
    );
    expect(JSON.parse(paid.text).choices[0].message.content).toBe("ok");
});

test("a failed settlement answers 402 with its receipt and drops the text", async () => {
    replies["/settle"] = () =>
        reply(400, {
            success: false,
            errorReason: "invalid_exact_evm_payload_signature",
            transaction: "",
            network: "eip155:8453",
        });

    const { response, text } = await payFor("/settle%20fails", {
        headers: CURL,
    });

    expect(response.status).toBe(402);
    expect(text).toBe("{}");
    expect(
        JSON.parse(atob(response.headers.get("payment-response"))),
    ).toMatchObject({
        success: false,
        errorReason: "invalid_exact_evm_payload_signature",
    });
    expect(response.headers.get("content-type")).toBe(
        "application/json; charset=utf-8",
    );
    expect(response.headers.get("etag")).toBe(
        'W/"2-vyGp6PvFo4RvsFtPoIWeCReyIC8"',
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("x-powered-by")).toBe("Express");
});

test("an unavailable facilitator at settlement answers 503", async () => {
    replies["/settle"] = () =>
        reply(503, {
            success: false,
            errorReason: "unavailable",
            errorMessage: "down",
            payer: PAYER,
            transaction: "",
            network: "eip155:8453",
        });

    const { response, text } = await payFor("/settle%20unavailable", {
        headers: CURL,
    });

    expect(response.status).toBe(503);
    expect(JSON.parse(text)).toEqual({ error: "facilitator_unavailable" });
    expect(response.headers.get("retry-after")).toBe("1");
    expect(response.headers.get("cache-control")).toBe("private");
    expect(response.headers.get("content-type")).toBe(
        "application/json; charset=utf-8",
    );
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
});

test("a generation that fails after verify is not settled", async () => {
    const failed = await payFor("/gen:500", { headers: CURL });
    expect(failed.response.status).toBe(500);
    expect(JSON.parse(failed.text)).toMatchObject({
        error: "500 Internal Server Error",
        status: 500,
    });
    expect(failed.response.headers.get("cache-control")).toBe(
        "private, no-store",
    );
    expect(events).not.toContain("/settle");

    const unknown = await payFor("/paid?model=zz-nonexistent-model", {
        headers: CURL,
    });
    expect(unknown.response.status).toBe(404);
    expect(JSON.parse(unknown.text).error).toBe(JSON.parse(vm404).error);
    expect(events).not.toContain("/settle");
});

test("a malformed facilitator reply gets an unpaid generation, as the VM's fail-open", async () => {
    replies["/verify"] = () => reply(200, "not json");

    const { response, text } = await payFor("/verify%20breaks", {
        headers: CURL,
    });

    expect(response.status).toBe(200);
    expect(text).toBe("ok");
    expect(response.headers.get("payment-response")).toBeNull();
    expect(response.headers.get("cache-control")).toBe(
        "public, max-age=31536000, immutable",
    );
    expect(events).not.toContain("/settle");
});

/** The Worker as a new isolate loads it, without this file's paywall */
async function freshWorker() {
    vi.resetModules();
    return (await import("../src/index.js")).default;
}

test("50 concurrent first requests in a fresh isolate all get a 402 and share one /supported call", async () => {
    const app = await freshWorker();
    const ip = await limitedIp();

    const answers = await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
            call(`/cold%20${i}`, { ip, headers: CURL, app }),
        ),
    );

    expect(answers.map(({ response }) => response.status)).toEqual(
        Array(50).fill(402),
    );
    expect(events.filter((event) => event === "/supported")).toHaveLength(1);
});

test("without /supported, a rate-limited request gets an unpaid generation, as the VM's fail-open", async () => {
    replies["/supported"] = () => reply(500, "facilitator down");
    const app = await freshWorker();

    const { response, text } = await call("/facilitator%20down", {
        ip: await limitedIp(),
        headers: CURL,
        app,
    });

    expect(response.status).toBe(200);
    expect(text).toBe("ok");
    expect(response.headers.get("payment-required")).toBeNull();
    expect(events).toEqual(["/supported", "gen"]);
});
