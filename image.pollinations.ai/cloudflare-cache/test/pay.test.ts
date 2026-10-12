import { env, fetchMock } from "cloudflare:test";
import { afterEach, beforeAll, expect, test, vi } from "vitest";
import myceliHeadHeaders from "./fixtures/image.myceli.ai-head-browser.headers?raw";
import browserBody from "./fixtures/image.pollinations.ai-get-browser.body?raw";
import browserHeaders from "./fixtures/image.pollinations.ai-get-browser.headers?raw";
import jsonHeaders from "./fixtures/image.pollinations.ai-get-json.headers?raw";
import headFailureHeaders from "./fixtures/image.pollinations.ai-head-json.headers?raw";
import postBody from "./fixtures/image.pollinations.ai-post-json.body?raw";
import postHeaders from "./fixtures/image.pollinations.ai-post-json.headers?raw";
import {
    alarmOf,
    call as callWorker,
    capturedHeaders,
    limitedIp,
    nextIp,
    storedAt,
} from "./helpers.ts";

// Live 402 captures from the VM (2026-10-11) and the paths they were taken on
const QUERY = "?width=256&height=256&nologo=true";
const CAPTURED_JSON =
    "/prompt/weftbaseline-1791750449-b%20a%20small%20yellow%20flower";
const CAPTURED_BROWSER =
    "/prompt/weftbaseline-1791750449-c%20a%20small%20yellow%20flower";
const CAPTURED_HEAD =
    "/prompt/weftbaseline-1791750449-g%20a%20small%20yellow%20flower";
const CAPTURED_POST =
    "/prompt/weftbaseline-1791750449-h%20a%20small%20yellow%20flower";
const CURL = { accept: "application/json", "user-agent": "curl/8.7.1" };
const BROWSER = {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
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
const reply = (statusCode: number, body: unknown) => ({
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
const events: string[] = [];
// Request headers per facilitator path, across the whole file
const facilitatorHeaders = { "/supported": [], "/verify": [], "/settle": [] };

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
                facilitatorHeaders[path].push(new Headers(options.headers));
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

// gen through the fixed responses in vitest.config.ts, recorded in events
const testEnv = {
    ...env,
    GEN: {
        fetch: (url: URL, init: RequestInit) => {
            events.push("gen");
            return env.GEN.fetch(url, init);
        },
    },
};
const call = (path: string, options = {}) =>
    callWorker(path, { testEnv, ...options });

/** A PAYMENT-SIGNATURE for a challenge; the stub facilitator accepts any signature */
function paymentFor(paymentRequired: string) {
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
async function payFor(
    path: string,
    options: { headers?: Record<string, string> } = {},
) {
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
        headers: { ...options.headers, "payment-signature": signature },
    });
}

const withoutLabel = (headers: Headers) => {
    const all = Object.fromEntries(headers);
    expect(all["x-legacy-path"]).toBe("worker");
    delete all["x-legacy-path"];
    return all;
};

test("the JSON 402 matches the VM's capture byte for byte, on both hosts and with any query", async () => {
    const vm = Object.fromEntries(capturedHeaders(jsonHeaders));

    for (const host of ["image.pollinations.ai", "image.myceli.ai"]) {
        const { response, text } = await call(
            `${CAPTURED_JSON}${QUERY}&token=secret&referrer=app`,
            { ip: await limitedIp(), host, headers: CURL },
        );

        expect(response.status).toBe(402);
        expect(text).toBe("{}");
        expect(withoutLabel(response.headers)).toEqual(vm);
    }
});

test("a rewritten path's challenge names /prompt on the origin host, without X-Cache", async () => {
    const { response } = await call("/a%20cat?seed=5&token=secret", {
        ip: await limitedIp(),
        headers: CURL,
    });

    expect(response.status).toBe(402);
    const challenge = JSON.parse(
        atob(response.headers.get("payment-required")),
    );
    expect(challenge.resource.url).toBe(
        "https://image-origin.pollinations.ai/prompt/a%20cat",
    );
    expect(response.headers.get("x-cache")).toBeNull();
});

test("the facilitator sees the VM's seller identity, once per isolate", async () => {
    await call("/prompt/identity", { ip: await limitedIp(), headers: CURL });

    expect(facilitatorHeaders["/supported"]).toHaveLength(1);
    const [headers] = facilitatorHeaders["/supported"];
    expect(headers.get("authorization")).toBe("Bearer test-seller-key");
    expect(headers.get("user-agent")).toBe("weft-sdk-express/0.27.1");
    const declared = JSON.stringify({
        name: "Pollinations legacy image",
        type: "api",
        tags: ["image"],
    });
    expect(headers.get("x-weft-declared")).toBe(
        btoa(declared)
            .replaceAll("+", "-")
            .replaceAll("/", "_")
            .replace(/=+$/, ""),
    );
});

test("browsers get the VM's paywall page byte for byte", async () => {
    const { response, text } = await call(`${CAPTURED_BROWSER}${QUERY}`, {
        ip: await limitedIp(),
        headers: BROWSER,
    });

    expect(response.status).toBe(402);
    expect(text).toBe(browserBody);
    // The edge drops Content-Length and ETag from HTML on the way out
    const vm = Object.fromEntries(capturedHeaders(browserHeaders));
    const headers = withoutLabel(response.headers);
    delete headers["content-length"];
    expect(headers).toEqual(vm);
});

test("a rate-limited HEAD generates unpaid without booking the slot, as on the VM", async () => {
    const ip = await limitedIp();
    const hold = await alarmOf(ip);

    const { response } = await call(`${CAPTURED_HEAD}${QUERY}`, {
        ip,
        host: "image.myceli.ai",
        method: "HEAD",
        headers: BROWSER,
    });

    expect(response.status).toBe(200);
    expect(withoutLabel(response.headers)).toEqual(
        Object.fromEntries(capturedHeaders(myceliHeadHeaders)),
    );
    expect(events).toEqual(["gen"]);
    expect(await alarmOf(ip)).toBe(hold);
    expect(await storedAt(`${CAPTURED_HEAD}${QUERY}`)).toBeNull();
});

test("a rate-limited HEAD whose generation fails gets the paid handler's JSON", async () => {
    const { response } = await call("/prompt/gen:429", {
        ip: await limitedIp(),
        method: "HEAD",
        headers: CURL,
    });

    // As the live 500 for a HEAD (gen failed then too): no X-Error-Type,
    // Express's X-Powered-By
    expect(response.status).toBe(500);
    expect(withoutLabel(response.headers)).toEqual(
        Object.fromEntries(capturedHeaders(headFailureHeaders)),
    );
});

test("a rate-limited POST, PUT, PATCH or DELETE gets Express's 404 page and no generation", async () => {
    const vm = Object.fromEntries(capturedHeaders(postHeaders));
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        const { response, text } = await call(`${CAPTURED_POST}${QUERY}`, {
            ip: await limitedIp(),
            method,
            headers: { ...CURL, "content-type": "application/json" },
            body: "{}",
        });

        expect(response.status, method).toBe(404);
        expect(text, method).toBe(postBody.replace("POST", method));
        const headers = withoutLabel(response.headers);
        delete headers["content-length"];
        expect(headers, method).toEqual(vm);
    }
    // finalhandler's encodeurl 2.0.0 keeps $ and | of the path the VM got
    // (^ arrives escaped); escape-html the quote
    const odd = await call("/prompt/$^|it's", {
        ip: await limitedIp(),
        method: "POST",
    });
    expect(odd.text).toContain("<pre>Cannot POST /prompt/$%5E|it&#39;s</pre>");
    expect(events).toEqual([]);
});

test("X-PAYMENT alone gets a fresh 402 without a /verify call", async () => {
    const { response } = await call("/prompt/x%20payment", {
        ip: await limitedIp(),
        headers: { ...CURL, "x-payment": "anything" },
    });

    expect(response.status).toBe(402);
    expect(events).not.toContain("/verify");
});

test("a payment header is ignored while the slot is free, and on a cache hit", async () => {
    const free = await call("/prompt/free%20with%20a%20payment", {
        ip: nextIp(),
        headers: { "payment-signature": "anything" },
    });
    expect(free.response.status).toBe(200);
    expect(free.response.headers.get("content-type")).toBe("image/jpeg");
    expect(await storedAt("/prompt/free%20with%20a%20payment")).toBeNull();

    await call("/prompt/cached%20before%20a%20payment", { ip: nextIp() });
    const hit = await call("/prompt/cached%20before%20a%20payment", {
        ip: await limitedIp(),
        headers: { "payment-signature": "anything" },
    });
    expect(hit.response.headers.get("x-cache")).toBe("HIT");
    expect(events).not.toContain("/verify");
});

test("while a free generation runs, the IP's next GET gets the 402", async () => {
    const ip = nextIp();
    const running = call("/prompt/gen:slow", { ip });
    await expect.poll(() => alarmOf(ip)).toBeGreaterThan(Date.now() + 45_000);

    const meanwhile = await call("/prompt/meanwhile", { ip, headers: CURL });

    expect(meanwhile.response.status).toBe(402);
    expect((await running).response.status).toBe(200);
    // Released, but within 45 s of its start: still 402
    const after = await call("/prompt/after", { ip, headers: CURL });
    expect(after.response.status).toBe(402);
});

test("a paid GET verifies, generates, then settles; it is private and never stored", async () => {
    const paid = await payFor("/prompt/paid%20get", { headers: CURL });

    expect(paid.response.status).toBe(200);
    expect(paid.response.headers.get("content-type")).toBe("image/jpeg");
    expect([paid.bytes[0], paid.bytes[1]]).toEqual([0xff, 0xd8]);
    expect(events).toEqual(["/verify", "gen", "/settle"]);
    expect(
        JSON.parse(atob(paid.response.headers.get("payment-response"))),
    ).toEqual(SETTLED);
    expect(paid.response.headers.get("cache-control")).toBe(
        "public, max-age=31536000, immutable, private",
    );
    expect(paid.response.headers.get("x-powered-by")).toBe("Pollinations.AI");
    expect(paid.response.headers.get("access-control-allow-methods")).toBe(
        "GET, POST, OPTIONS",
    );
    expect(await storedAt("/prompt/paid%20get")).toBeNull();
    // The payment calls carried the VM's Node fetch User-Agent
    for (const path of ["/verify", "/settle"]) {
        const headers = facilitatorHeaders[path].at(-1);
        expect(headers.get("user-agent"), path).toBe("node");
        expect(headers.get("x-api-key"), path).toBe("test-seller-key");
    }
});

test("a paid generation leaves the IP's slot as it was", async () => {
    const ip = await limitedIp();
    const hold = await alarmOf(ip);
    const challenge = await call("/prompt/paid%20slot", { ip, headers: CURL });
    const signature = paymentFor(
        challenge.response.headers.get("payment-required"),
    );

    await call("/prompt/paid%20slot", {
        ip,
        headers: { ...CURL, "payment-signature": signature },
    });

    expect(await alarmOf(ip)).toBe(hold);
});

test("a failed settlement answers 402 with its receipt and drops the image", async () => {
    replies["/settle"] = () =>
        reply(400, {
            success: false,
            errorReason: "invalid_exact_evm_payload_signature",
            transaction: "",
            network: "eip155:8453",
        });

    const { response, text } = await payFor("/prompt/settle%20fails", {
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
    expect(response.headers.get("access-control-allow-methods")).toBe(
        "GET, POST, OPTIONS",
    );
    expect(response.headers.get("x-cache")).toBe("MISS");
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

    const { response, text } = await payFor("/prompt/settle%20unavailable", {
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
    expect(response.headers.get("access-control-allow-headers")).toBe(
        "Content-Type, X-PAYMENT, Payment-Signature",
    );
});

test("a generation that fails after verify is not settled and gets the paid handler's JSON", async () => {
    const failed = await payFor("/prompt/gen:503", { headers: CURL });

    expect(failed.response.status).toBe(500);
    expect(JSON.parse(failed.text)).toEqual({
        error: 'Gen Sana request failed with 503: {"error":"gen answered 503"}',
    });
    expect(failed.response.headers.get("content-type")).toBe(
        "application/json",
    );
    expect(failed.response.headers.get("cache-control")).toBeNull();
    expect(failed.response.headers.get("x-powered-by")).toBe("Express");
    expect(failed.response.headers.get("x-error-type")).toBeNull();
    expect(events).toEqual(["/verify", "gen"]);
});

test("a malformed facilitator reply gets Express's 500 page, as the VM's error handler", async () => {
    replies["/verify"] = () => reply(200, "not json");

    const { response, text } = await payFor("/prompt/verify%20breaks", {
        headers: CURL,
    });

    expect(response.status).toBe(500);
    expect(text).toBe(
        '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Error</title>\n</head>\n<body>\n<pre>Internal Server Error</pre>\n</body>\n</html>\n',
    );
    expect(response.headers.get("content-type")).toBe(
        "text/html; charset=utf-8",
    );
    expect(response.headers.get("x-powered-by")).toBe("Express");
    expect(response.headers.get("access-control-allow-methods")).toBe(
        "GET, POST, OPTIONS",
    );
    expect(events).not.toContain("gen");
    expect(events).not.toContain("/settle");
});

/** The Worker as a new isolate loads it, without this file's paywall */
async function freshWorker() {
    vi.resetModules();
    return (await import("../src/index.ts")).default;
}

test("50 concurrent first requests in a fresh isolate all get a 402 and share one /supported call", async () => {
    const app = await freshWorker();
    const ip = await limitedIp();

    const answers = await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
            call(`/prompt/cold%20${i}`, { ip, headers: CURL, app }),
        ),
    );

    expect(answers.map(({ response }) => response.status)).toEqual(
        Array(50).fill(402),
    );
    expect(events.filter((event) => event === "/supported")).toHaveLength(1);
});

test("without /supported, a rate-limited GET gets Express's 500 page, as on the VM", async () => {
    replies["/supported"] = () => reply(500, "facilitator down");
    const app = await freshWorker();

    const { response, text } = await call("/prompt/facilitator%20down", {
        ip: await limitedIp(),
        headers: CURL,
        app,
    });

    expect(response.status).toBe(500);
    expect(text).toContain("<pre>Internal Server Error</pre>");
    expect(response.headers.get("payment-required")).toBeNull();
    expect(events).toEqual(["/supported"]);
});
