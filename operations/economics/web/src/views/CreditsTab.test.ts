import { describe, expect, it } from "vitest";
import {
    depletionTone,
    isActiveBalanceRow,
    needsBalanceAttention,
} from "./CreditsTab";

describe("isActiveBalanceRow", () => {
    it("tracks whether any provider balance remains", () => {
        expect(isActiveBalanceRow({ finished: false })).toBe(true);
        expect(isActiveBalanceRow({ finished: true })).toBe(false);
    });
});

describe("needsBalanceAttention", () => {
    it("ignores finished pools and flags only active unchecked balances", () => {
        expect(
            needsBalanceAttention({
                finished: true,
                balanceStatus: "not_checked",
            }),
        ).toBe(false);
        expect(
            needsBalanceAttention({
                finished: false,
                balanceStatus: "partial",
            }),
        ).toBe(true);
        expect(
            needsBalanceAttention({
                finished: false,
                balanceStatus: "checked",
            }),
        ).toBe(false);
    });
});

describe("depletionTone", () => {
    const now = new Date("2026-07-08T12:00:00Z");

    it("is red under 30 days, amber under 90, soft otherwise", () => {
        expect(depletionTone("2026-07-22", now)).toBe(
            "text-intent-danger-text",
        );
        expect(depletionTone("2026-09-01", now)).toBe(
            "text-intent-warning-text",
        );
        expect(depletionTone("2027-01-01", now)).toBe("text-theme-text-soft");
        expect(depletionTone(null, now)).toBe("text-theme-text-soft");
    });
});
