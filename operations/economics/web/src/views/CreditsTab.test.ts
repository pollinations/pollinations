import { describe, expect, it } from "vitest";
import {
    depletionTone,
    isActiveBalanceRow,
    needsBalanceAttention,
} from "./CreditsTab";

describe("isActiveBalanceRow", () => {
    it("uses the provider lifecycle rather than its remaining balance", () => {
        expect(isActiveBalanceRow({ active: true })).toBe(true);
        expect(isActiveBalanceRow({ active: false })).toBe(false);
    });
});

describe("needsBalanceAttention", () => {
    it("flags only active tracked balances that are not checked", () => {
        expect(
            needsBalanceAttention({
                active: false,
                balanceTracking: true,
                balanceStatus: "not_checked",
            }),
        ).toBe(false);
        expect(
            needsBalanceAttention({
                active: true,
                balanceTracking: true,
                balanceStatus: "stale",
            }),
        ).toBe(true);
        expect(
            needsBalanceAttention({
                active: true,
                balanceTracking: true,
                balanceStatus: "checked",
            }),
        ).toBe(false);
        expect(
            needsBalanceAttention({
                active: true,
                balanceTracking: false,
                balanceStatus: "not_applicable",
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
