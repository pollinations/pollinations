import { env } from "cloudflare:test";
import { test } from "@shared/test/fixtures/index.ts";
import { expect } from "vitest";
import { createX402Routes } from "../src/routes/x402.ts";

// Burn address. The 402 challenge is built without touching a chain, so no real
// settlement destination is needed to assert the advertised requirements.
const PAY_TO = "0x000000000000000000000000000000000000dEaD";

const x402Env = { ...env, WEFT_PAY_TO: PAY_TO, WEFT_NETWORK: "eip155:84532" };

async function challenge(body: unknown) {
    const app = createX402Routes(x402Env as CloudflareBindings);
    const response = await app.request(
        "/x402/v1/chat/completions",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        },
        x402Env,
    );
    expect(response.status).toBe(402);
    const header = response.headers.get("PAYMENT-REQUIRED");
    expect(header).toBeTruthy();
    return JSON.parse(atob(header as string));
}

const usd = (accepts: { amount: string }) => Number(accepts.amount) / 1e6;

test("advertises both upto and exact for the configured network", async () => {
    const { accepts } = await challenge({
        model: "openai",
        max_tokens: 100,
        messages: [{ role: "user", content: "hi" }],
    });

    expect(accepts.map((a: { scheme: string }) => a.scheme).sort()).toEqual([
        "exact",
        "upto",
    ]);
    for (const option of accepts) {
        expect(option.network).toBe("eip155:84532");
        expect(option.payTo).toBe(PAY_TO);
    }
    // Only `upto` can settle below the signed amount, so it must carry Permit2.
    const upto = accepts.find((a: { scheme: string }) => a.scheme === "upto");
    expect(upto.extra.assetTransferMethod).toBe("permit2");
});

// Regression: the Hono adapter's getBody() is async. Passing the unawaited
// promise made every request price at the floor, silently — the challenge still
// looked well-formed, so only a body-sensitive assertion catches it.
test("ceiling scales with the requested output cap", async () => {
    const small = await challenge({
        model: "openai",
        max_tokens: 1000,
        messages: [{ role: "user", content: "hi" }],
    });
    const large = await challenge({
        model: "openai",
        max_tokens: 100_000,
        messages: [{ role: "user", content: "hi" }],
    });

    expect(usd(large.accepts[0])).toBeGreaterThan(usd(small.accepts[0]) * 10);
});

test("ceiling scales with model rate and prompt size", async () => {
    const cheap = await challenge({
        model: "openai",
        max_tokens: 10_000,
        messages: [{ role: "user", content: "hi" }],
    });
    const pricey = await challenge({
        model: "glm-5.3",
        max_tokens: 10_000,
        messages: [{ role: "user", content: "hi" }],
    });
    const longPrompt = await challenge({
        model: "glm-5.3",
        max_tokens: 10_000,
        messages: [{ role: "user", content: "x".repeat(40_000) }],
    });

    expect(usd(pricey.accepts[0])).toBeGreaterThan(usd(cheap.accepts[0]));
    expect(usd(longPrompt.accepts[0])).toBeGreaterThan(usd(pricey.accepts[0]));
});

test("stays closed when no settlement address is configured", async () => {
    const app = createX402Routes({
        ...env,
        WEFT_PAY_TO: undefined,
    } as unknown as CloudflareBindings);
    const response = await app.request("/x402/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "openai", messages: [] }),
    });
    expect(response.status).toBe(404);
});
