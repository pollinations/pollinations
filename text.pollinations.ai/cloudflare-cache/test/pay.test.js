import { env, fetchMock, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeAll, expect, test, vi } from "vitest";
import { MAX_HOLD_MS } from "../../../shared/ip-slot.js";
import { nextMidnight, takeQuota, usedUp } from "../src/daily-quota.js";
import browserHeaders from "./fixtures/text.pollinations.ai-get-browser.headers?raw";
import {
    alarmOf,
    call as callWorker,
    capturedHeaders,
    nextIp,
    storedAt,
} from "./helpers.js";

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
const call = (path, options) => callWorker(path, { testEnv, ...options });

/** An IP whose free generation is running, as IpSlot stores it */
async function limitedIp() {
    const ip = nextIp();
    await runInDurableObject(env.IP_SLOT.getByName(ip), (_slot, state) =>
        state.storage.setAlarm(Date.now() + MAX_HOLD_MS),
    );
    return ip;
}

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

const ENTER = "https://enter.pollinations.ai/?ref=classic";
const NOTICE =
    /^Free limit reached: 1 reply every 45 seconds per IP\. Please wait \d+ seconds or \[get unlimited replies\]\(https:\/\/enter\.pollinations\.ai\/\?ref=classic\), then try again\./;

test("a script or app past the free limit gets the notice in the 402, a Retry-After and the VM's challenge, on both hosts and with any query", async () => {
    for (const host of ["text.pollinations.ai", "text.myceli.ai"]) {
        const { response, text } = await call(
            `${CAPTURED_JSON}?token=secret&referrer=app`,
            { ip: await limitedIp(), host, headers: CURL },
        );

        expect(response.status).toBe(402);
        expect(response.headers.get("content-type")).toBe(
            "text/plain; charset=utf-8",
        );
        const wait = Number(response.headers.get("retry-after"));
        expect(wait).toBeGreaterThan(0);
        expect(wait).toBeLessThanOrEqual(45);
        expect(text).toMatch(NOTICE);
        // The challenge names the VM's origin host and path, without the query
        const challenge = JSON.parse(
            atob(response.headers.get("payment-required")),
        );
        expect(challenge.resource.url).toBe(
            `https://text-origin.pollinations.ai${CAPTURED_JSON}`,
        );
    }
});

test("a JSON-mode request past the free limit gets gen's error body and the VM's challenge", async () => {
    const { response, text } = await call(`${CAPTURED_JSON}?json=true`, {
        ip: await limitedIp(),
        headers: CURL,
    });

    expect(response.status).toBe(402);
    const wait = response.headers.get("retry-after");
    // Readable by browser code on another origin
    expect(response.headers.get("access-control-expose-headers")).toContain(
        "Retry-After",
    );
    const body = JSON.parse(text);
    expect(body).toEqual({
        status: 402,
        success: false,
        error: {
            code: "FREE_LIMIT",
            message: `Free limit reached: 1 reply every 45 seconds per IP. Retry after ${wait}s, or get unlimited replies with a pollen key at ${ENTER}`,
            timestamp: body.error.timestamp,
            fixUrl: ENTER,
        },
    });
    // The challenge names the VM's origin host and path, without the query
    const challenge = JSON.parse(
        atob(response.headers.get("payment-required")),
    );
    expect(challenge.resource.url).toBe(
        `https://text-origin.pollinations.ai${CAPTURED_JSON}`,
    );
});

test("the facilitator sees the VM's seller identity, once per isolate", async () => {
    await call("/identity", { ip: await limitedIp(), headers: CURL });

    expect(facilitatorHeaders["/supported"]).toHaveLength(1);
    const [headers] = facilitatorHeaders["/supported"];
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

test("POST /openai past the free limit gets gen's error body and the challenge", async () => {
    const { response, text } = await call("/openai", {
        ip: await limitedIp(),
        ...jsonPost({ messages: [{ role: "user", content: "hi" }] }),
    });

    expect(response.status).toBe(402);
    const wait = response.headers.get("retry-after");
    const { error } = JSON.parse(text);
    expect(error.code).toBe("FREE_LIMIT");
    expect(error.message).toBe(
        `Free limit reached: 1 reply every 45 seconds per IP. Retry after ${wait}s, or get unlimited replies with a pollen key at ${ENTER}`,
    );
    expect(response.headers.get("payment-required")).not.toBeNull();
});

/** The DailyQuota object of an IP today, with `used` free replies */
async function quotaOf(ip, used) {
    const day = new Date().toISOString().slice(0, 10);
    const quota = env.DAILY_QUOTA.getByName(`${day} ${ip}`);
    if (used !== undefined) {
        await runInDurableObject(quota, (_quota, state) =>
            state.storage.put("used", used),
        );
    }
    return runInDurableObject(quota, (_quota, state) =>
        state.storage.get("used"),
    );
}

const DAILY_NOTICE =
    /^Free limit reached: 50 replies a day per IP\. It resets at 00:00 UTC, in \d+ hours?, or \[get unlimited replies\]\(https:\/\/enter\.pollinations\.ai\/\?ref=classic\) now\./;

test("the 50th free reply of the day is served and counted, the 51st goes to the paywall until midnight", async () => {
    const ip = nextIp();
    await quotaOf(ip, 49);
    const last = await call("/quota%2049", { ip, headers: CURL });
    expect(last.response.status).toBe(200);
    expect(await quotaOf(ip)).toBe(50);
    // 45 seconds later: the slot is free again
    await runInDurableObject(
        env.IP_SLOT.getByName(ip),
        async (_slot, state) => {
            await state.storage.deleteAlarm();
            await state.storage.deleteAll();
        },
    );

    events.length = 0;
    for (const [path, headers] of [
        // A stream first: takeSlot's memo answers other requests in the interval
        ["/quota%2050?stream=true", CURL],
        ["/quota%2050", CURL],
        ["/quota%2050", BROWSER],
    ]) {
        const { response, text } = await call(path, { ip, headers });
        expect(response.status, path).toBe(402);
        expect(response.headers.get("content-type")).toBe(
            "text/plain; charset=utf-8",
        );
        expect(text).toMatch(DAILY_NOTICE);
        const wait = Number(response.headers.get("retry-after"));
        expect(Date.now() + wait * 1000).toBeGreaterThanOrEqual(
            Math.ceil(Date.now() / 86_400_000) * 86_400_000,
        );
        expect(response.headers.get("payment-required")).not.toBeNull();
    }
    expect(events).not.toContain("gen");
    // The refused stream ended its booking but kept the interval
    expect(await alarmOf(ip)).toBeGreaterThan(Date.now());
});

test("a model we don't serve uses no quota", async () => {
    const ip = nextIp();
    await quotaOf(ip, 49);
    const { response } = await call("/quota?model=gpt-5", {
        ip,
        headers: CURL,
    });
    expect(response.status).toBe(404);
    expect(await quotaOf(ip)).toBe(49);
});

test("a quota used up just before midnight is not remembered into the new day", async () => {
    const ip = nextIp();
    const beforeMidnight = nextMidnight() - 86_400_000 - 1;
    expect(await takeQuota(env.DAILY_QUOTA, ip, 0, beforeMidnight)).toBe(false);
    expect(usedUp(ip)).toBe(false);
});

test("a JSON request past the daily quota gets gen's error body", async () => {
    const ip = nextIp();
    await quotaOf(ip, 50);
    const { response, text } = await call("/quota?json=true", {
        ip,
        headers: CURL,
    });

    expect(response.status).toBe(402);
    const { error } = JSON.parse(text);
    expect(error.code).toBe("FREE_LIMIT");
    expect(error.message).toMatch(
        /^Free limit reached: 50 replies a day per IP\. It resets at 00:00 UTC, in \d+ hours?\. Get unlimited replies with a pollen key at /,
    );
});

test("a request paid past the daily quota is answered", async () => {
    const ip = nextIp();
    await quotaOf(ip, 50);
    const challenge = await call("/quota%20paid", { ip, headers: CURL });
    expect(challenge.response.status).toBe(402);
    const paid = await call("/quota%20paid", {
        ip,
        headers: {
            ...CURL,
            "payment-signature": paymentFor(
                challenge.response.headers.get("payment-required"),
            ),
        },
    });
    expect(paid.response.status).toBe(200);
    expect(await quotaOf(ip)).toBe(50);
});

test("browsers get the free limit's page, which reloads when the wait is over, and the VM's challenge", async () => {
    const { response, text } = await call(CAPTURED_BROWSER, {
        ip: await limitedIp(),
        headers: BROWSER,
    });

    expect(response.status).toBe(402);
    const wait = response.headers.get("retry-after");
    expect(text).toContain("Free limit reached");
    // The page names the price the challenge asks, in USDC's 6 decimals
    const { accepts } = JSON.parse(
        atob(response.headers.get("payment-required")),
    );
    const [, price] = text.match(/([\d.]+) USD per reply with Weft/) ?? [];
    expect(Math.round(Number(price) * 1e6)).toBe(Number(accepts[0].amount));
    expect(text).toContain(
        "1 free reply every 45 seconds. Please wait: this page reloads by itself when your next reply is ready.",
    );
    expect(text).toContain("Skip the wait");
    expect(text).not.toContain("undefined");
    // No clock to watch: the page reloads by itself when the wait is over
    expect(text).toContain(
        `setTimeout(() => location.reload(), ${wait} * 1000);`,
    );
    // Straight to GitHub's sign-in, tagged as a Classic visit
    expect(text).toContain(
        'href="https://enter.pollinations.ai/sign-in?ref=legacy-text"',
    );
    expect(text).not.toContain("{{");
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

test("a browser sending a broken payment header still gets the page, not the paywall's empty one", async () => {
    for (const header of ["payment-signature", "x-payment"]) {
        const { response, text } = await call("/broken%20payment", {
            ip: await limitedIp(),
            headers: { ...BROWSER, [header]: "not a payment" },
        });

        expect(response.status, header).toBe(402);
        expect(text, header).toContain("Free limit reached");
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
            "text/plain; charset=utf-8",
        );
        expect(text).toMatch(NOTICE);
    }
});

test("a rate-limited HEAD returns 429 without calling gen or the paywall", async () => {
    const ip = await limitedIp();
    const hold = await alarmOf(ip);

    const { response, text } = await call(CAPTURED_HEAD, {
        ip,
        method: "HEAD",
        headers: CURL,
    });

    expect(response.status).toBe(429);
    expect(text).toBe("");
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("payment-required")).toBeNull();
    expect(events).toEqual([]);
    expect(await alarmOf(ip)).toBe(hold);
    expect(await storedAt(CAPTURED_HEAD)).toBeNull();
});

test("an unknown model books the free slot and gets a 404; then the IP gets 402s", async () => {
    const ip = nextIp();

    const free = await call("/check?model=zz-nonexistent-model", {
        ip,
        headers: CURL,
    });
    expect(free.response.status).toBe(404);
    expect(JSON.parse(free.text).error.code).toBe("NOT_FOUND");

    const next = await call("/check%202", { ip, headers: CURL });
    expect(next.text).toMatch(NOTICE);
    const unknown = await call("/check%203?model=zz-nonexistent-model", {
        ip,
        headers: CURL,
    });
    expect(unknown.text).toMatch(NOTICE);
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

test("without every WEFT_* value the paywall is off: rate-limited requests queue as on the VM", async () => {
    const off = { ...testEnv, WEFT_SELLER_API_KEY: undefined };

    const held = await call("/weft%20off", {
        ip: await limitedIp(),
        headers: CURL,
        testEnv: off,
    });
    expect(held.response.status).toBe(429);
    expect(JSON.parse(held.text).error.code).toBe("RATE_LIMITED");

    // The last free generation started 44.8 s ago and has ended
    const ip = nextIp();
    await runInDurableObject(env.IP_SLOT.getByName(ip), (_slot, state) =>
        state.storage.setAlarm(Date.now() + 200),
    );
    const waited = await call("/weft%20off%20waits", {
        ip,
        headers: CURL,
        testEnv: off,
    });
    expect(waited.response.status).toBe(200);
    expect(waited.text).toBe("ok");
    expect(waited.response.headers.get("payment-required")).toBeNull();
    expect(events).toEqual(["gen"]);
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
    // The payment calls carried the VM's Node fetch User-Agent
    for (const path of ["/verify", "/settle"]) {
        const headers = facilitatorHeaders[path].at(-1);
        expect(headers.get("user-agent"), path).toBe("node");
        expect(headers.get("x-api-key"), path).toBe("test-seller-key");
    }
});

test("a paid GET with a matching If-None-Match settles, then gets the 304 with its receipt", async () => {
    // The VM's payment middleware settled every status below 400
    const paid = await payFor("/paid%20if%20none%20match", {
        headers: { ...CURL, "if-none-match": "*" },
    });

    expect(paid.response.status).toBe(304);
    expect(paid.text).toBe("");
    expect(events).toEqual(["/verify", "gen", "/settle"]);
    expect(
        JSON.parse(atob(paid.response.headers.get("payment-response"))),
    ).toEqual(SETTLED);
    expect(paid.response.headers.get("cache-control")).toBe(
        "public, max-age=31536000, immutable, private",
    );
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
    expect(failed.response.status).toBe(503);
    expect(JSON.parse(failed.text).error.code).toBe("SERVICE_UNAVAILABLE");
    expect(failed.response.headers.get("cache-control")).toBe(
        "private, no-store",
    );
    expect(events).not.toContain("/settle");

    const unknown = await payFor("/paid?model=zz-nonexistent-model", {
        headers: CURL,
    });
    expect(unknown.response.status).toBe(404);
    expect(JSON.parse(unknown.text).error.code).toBe("NOT_FOUND");
    expect(events).not.toContain("/settle");
});

test("a malformed verify reply returns 503 without generating", async () => {
    replies["/verify"] = () => reply(200, "not json");

    const { response, text } = await payFor("/verify%20breaks", {
        headers: CURL,
    });

    expect(response.status).toBe(503);
    expect(JSON.parse(text).error.code).toBe("SERVICE_UNAVAILABLE");
    expect(response.headers.get("Retry-After")).toBe("10");
    expect(response.headers.get("payment-response")).toBeNull();
    expect(events).toEqual(["/verify"]);
});

test("a malformed settlement reply returns 503 after one generation", async () => {
    replies["/settle"] = () => reply(200, "not json");

    const { response, text } = await payFor("/settle%20breaks", {
        headers: CURL,
    });

    expect(response.status).toBe(503);
    expect(JSON.parse(text).error.code).toBe("SERVICE_UNAVAILABLE");
    expect(events).toEqual(["/verify", "gen", "/settle"]);
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

test("after a facilitator outage at first use, the paywall is built again on the first request 30 s later", async () => {
    replies["/supported"] = () => reply(500, "facilitator down");
    const app = await freshWorker();
    const ip = await limitedIp();
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
        const down = await call("/outage%201", { ip, headers: CURL, app });
        expect(down.response.status).toBe(503);
        expect(events).toEqual(["/supported"]);

        // Still down, within 30 s of the failed sync: no new /supported call
        events.length = 0;
        vi.setSystemTime(Date.now() + 29_000);
        const stillDown = await call("/outage%202", {
            ip,
            headers: CURL,
            app,
        });
        expect(stillDown.response.status).toBe(503);
        expect(events).toEqual([]);

        // Back up, 30 s after the failed sync: the challenge again
        replies["/supported"] = STUB_REPLIES["/supported"];
        vi.setSystemTime(Date.now() + 1_000);
        const back = await call("/outage%203", { ip, headers: CURL, app });
        expect(back.response.status).toBe(402);
        expect(events).toEqual(["/supported"]);
    } finally {
        vi.useRealTimers();
    }
});

test("without /supported, a rate-limited request returns 503 without generating", async () => {
    replies["/supported"] = () => reply(500, "facilitator down");
    const app = await freshWorker();

    const { response, text } = await call("/facilitator%20down", {
        ip: await limitedIp(),
        headers: CURL,
        app,
    });

    expect(response.status).toBe(503);
    expect(JSON.parse(text).error.code).toBe("SERVICE_UNAVAILABLE");
    expect(response.headers.get("Retry-After")).toBe("10");
    expect(response.headers.get("payment-required")).toBeNull();
    expect(events).toEqual(["/supported"]);
    expect(await storedAt("/facilitator%20down")).toBeNull();
});
