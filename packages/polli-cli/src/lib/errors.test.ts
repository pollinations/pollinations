import { afterEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "./config.js";
import { budgetHint } from "./errors.js";

afterEach(() => vi.restoreAllMocks());

describe("budgetHint", () => {
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
            Response.json({ balance: 0 }),
        );
        const hint = await budgetHint(
            402,
            JSON.stringify({ error: { code: "INSUFFICIENT_BALANCE" } }),
        );
        expect(hint).toContain("Top up: https://enter.pollinations.ai/pollen");
        expect(hint).toContain("Account balance: 0 pollen");
        expect(hint).not.toContain("Manage key budget:");
    });

    it("does not assume an unknown 402 is a wallet failure", async () => {
        setKeyOverride("test-only");
        vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
        const hint = await budgetHint(402, "Payment required");
        expect(hint).toContain("Check your pollen balance and API key budget");
        expect(hint).toContain("https://enter.pollinations.ai/keys");
    });

    it("leaves non-payment errors alone", async () => {
        expect(await budgetHint(429, "slow down")).toBeNull();
    });
});
