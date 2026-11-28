import { afterEach, describe, expect, it, vi } from "vitest";
import { gen, paymentHint } from "./api.js";
import { POLLI_CLIENT } from "./client.js";
import { ENTER_URL, setKeyOverride } from "./config.js";
import { fetchGen } from "./errors.js";

afterEach(() => vi.restoreAllMocks());

describe("paymentHint", () => {
    it("shows the server's specific payment guidance without adding conflicting remedies", async () => {
        setKeyOverride("test-only");
        const message =
            "Your Quest balance is locked. Contact hello@pollinations.ai for help.";
        const body = { error: { code: "QUEST_POLLEN_RESTRICTED", message } };
        const fetch = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(Response.json(body, { status: 402 }));
        expect(paymentHint(402, JSON.stringify(body))).toBe(message);
        expect(fetch).not.toHaveBeenCalled();
        await expect(gen("/test")).rejects.toMatchObject({
            status: 402,
            message,
        });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("shows sandbox and plain-text payment messages", () => {
        const message = "This sandbox couldn't start. Contact its owner.";
        expect(paymentHint(402, JSON.stringify({ code: 402, message }))).toBe(
            message,
        );
        expect(paymentHint(402, message)).toBe(message);
    });

    it.each(["", JSON.stringify({ error: { code: "INSUFFICIENT_BALANCE" } })])(
        "offers a single recovery hint when a 402 has no message",
        (body) => {
            expect(paymentHint(402, body)).toContain(
                `Check your balance and key budget at ${ENTER_URL}`,
            );
        },
    );

    it.each([
        [undefined, "https://staging.enter.pollinations.ai"],
        ["https://billing.example.test", "https://billing.example.test"],
    ])(
        "uses the configured billing site for a staging 402 (override %s)",
        async (override, expected) => {
            vi.stubEnv("POLLINATIONS_ENV", "staging");
            vi.stubEnv("POLLINATIONS_ENTER_URL", override);
            vi.resetModules();
            try {
                const { paymentHint } = await import("./api.js");
                expect(paymentHint(402, "")).toBe(
                    `Payment required. Check your balance and key budget at ${expected}`,
                );
            } finally {
                vi.unstubAllEnvs();
                vi.resetModules();
            }
        },
    );

    it("leaves non-payment errors alone", () => {
        expect(paymentHint(429, "slow down")).toBeNull();
    });
});

it("marks direct generation requests with the CLI version", async () => {
    setKeyOverride("test-only");
    const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("ok"));

    await fetchGen("/image/test");

    const init = fetch.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("X-Polli-Client")).toBe(POLLI_CLIENT);
});
