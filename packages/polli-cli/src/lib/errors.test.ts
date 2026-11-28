import { afterEach, describe, expect, it, vi } from "vitest";
import { gen } from "./api.js";
import { POLLI_CLIENT } from "./client.js";
import { setKeyOverride } from "./config.js";
import { budgetHint, fetchGen } from "./errors.js";

afterEach(() => vi.restoreAllMocks());

describe("budgetHint", () => {
    it("shows the server's specific payment guidance without adding conflicting remedies", async () => {
        setKeyOverride("test-only");
        const message =
            "Your Quest balance is locked. Contact hello@pollinations.ai for help.";
        const body = { error: { code: "QUEST_POLLEN_RESTRICTED", message } };
        const fetch = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(Response.json(body, { status: 402 }));
        expect(await budgetHint(402, JSON.stringify(body))).toBe(message);
        expect(fetch).not.toHaveBeenCalled();
        await expect(gen("/test")).rejects.toMatchObject({
            status: 402,
            message,
        });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("directs exhausted keys to key settings without fetching wallet balance", async () => {
        const fetch = vi.spyOn(globalThis, "fetch");
        const hint = await budgetHint(
            402,
            JSON.stringify({ error: { code: "KEY_BUDGET_EXHAUSTED" } }),
        );
        expect(hint).toContain("https://enter.pollinations.ai/keys");
        expect(hint).not.toContain("Top up:");
        expect(fetch).not.toHaveBeenCalled();
    });

    it("directs insufficient balances to wallet top-up", async () => {
        setKeyOverride("test-only");
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({
                balance: 4.4691,
                accountBalance: { total: 0, tier: 0, paid: 0 },
            }),
        );
        const hint = await budgetHint(
            402,
            JSON.stringify({ error: { code: "INSUFFICIENT_BALANCE" } }),
        );
        expect(hint).toContain("Top up: https://enter.pollinations.ai/top-up");
        expect(hint).toContain("Balance: https://enter.pollinations.ai/pollen");
        expect(hint).toContain("Account balance: $0.00");
        expect(hint).not.toContain("Manage key budget:");
    });

    it("does not label a hidden wallet's key budget as the account balance", async () => {
        setKeyOverride("test-only");
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({ balance: 4.4691 }),
        );
        const hint = await budgetHint(
            402,
            JSON.stringify({ error: { code: "INSUFFICIENT_BALANCE" } }),
        );
        expect(hint).not.toContain("Account balance:");
        expect(hint).toContain("Balance too low");
    });

    it("keeps reporting the visible wallet for an unbudgeted key", async () => {
        setKeyOverride("test-only");
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({
                balance: 2.5,
                accountBalance: { total: 2.5, tier: 2.5, paid: 0 },
            }),
        );
        const hint = await budgetHint(402, "Payment required");
        expect(hint).toContain("Account balance: $2.50");
    });

    it.each([
        "Payment required",
        JSON.stringify({ error: { code: "QUEST_POLLEN_RESTRICTED" } }),
        JSON.stringify({ error: { code: "QUEST_POLLEN_ONLY" } }),
    ])(
        "avoids guessing a remedy for a 402 without a message: %s",
        async (body) => {
            setKeyOverride("test-only");
            vi.spyOn(globalThis, "fetch").mockRejectedValue(
                new Error("offline"),
            );
            const hint = await budgetHint(402, body);
            expect(hint).toContain("Check your balance and API key budget");
            expect(hint).toContain("https://enter.pollinations.ai/keys");
            expect(hint).not.toContain("Top up:");
            expect(hint).not.toContain("/quests");
        },
    );

    it("leaves non-payment errors alone", async () => {
        expect(await budgetHint(429, "slow down")).toBeNull();
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
