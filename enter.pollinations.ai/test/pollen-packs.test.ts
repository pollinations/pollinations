import {
    describePollenPack,
    getPackForeignCents,
    getPollenPackByAmount,
    getPollenPackByKey,
    isPollenPackKey,
    POLLEN_PACKS,
} from "@shared/pollen-packs.ts";
import { expect, test } from "vitest";

test("pollen pack catalog includes the stepped beta bonus ladder", () => {
    expect(POLLEN_PACKS.map((pack) => pack.amountUsd)).toEqual([
        2, 5, 10, 20, 50, 100,
    ]);
    expect(POLLEN_PACKS.map((pack) => pack.pollenGrant)).toEqual([
        2, 6, 13, 28, 75, 160,
    ]);
    expect(POLLEN_PACKS.map((pack) => pack.packKey)).toEqual([
        "p2",
        "p5",
        "p10",
        "p20",
        "p50",
        "p100",
    ]);
});

test("pack lookup by packKey (checkout route)", () => {
    expect(isPollenPackKey("p20")).toBe(true);
    expect(isPollenPackKey("p3")).toBe(false);
    expect(getPollenPackByKey("p20")?.bonusPollen).toBe(8);
    expect(getPollenPackByKey("p100")?.pollenGrant).toBe(160);
    expect(getPollenPackByKey("nope")).toBeUndefined();
});

test("pack lookup by amount (auto-top-up enrollment)", () => {
    expect(getPollenPackByAmount(20)?.bonusPollen).toBe(8);
    expect(getPollenPackByAmount(100)?.pollenGrant).toBe(160);
    expect(getPollenPackByAmount(3)).toBeUndefined();
});

test("getPackForeignCents derives target-currency cents from USD reference × FX rate", () => {
    const p5 = getPollenPackByKey("p5");
    if (!p5) throw new Error("p5 pack missing from catalog");

    // EUR: $5 × 100 × 0.93 = 465 EUR cents (€4.65)
    expect(getPackForeignCents(p5, 0.93)).toBe(465);
    // Parity rate: $5 × 100 × 1.00 = 500 cents
    expect(getPackForeignCents(p5, 1.0)).toBe(500);
    // Rounding: $5 × 100 × 0.9123 = 456.15 → 456
    expect(getPackForeignCents(p5, 0.9123)).toBe(456);

    // Larger packs scale linearly (EUR).
    const p100 = getPollenPackByKey("p100");
    if (!p100) throw new Error("p100 pack missing from catalog");
    expect(getPackForeignCents(p100, 0.93)).toBe(9300);

    // INR: $10 × 100 × 85.0 = 85000 paise (₹850.00)
    const p10 = getPollenPackByKey("p10");
    if (!p10) throw new Error("p10 pack missing from catalog");
    expect(getPackForeignCents(p10, 85.0)).toBe(85000);

    // GBP: $20 × 100 × 0.79 = 1580 pence (£15.80)
    const p20 = getPollenPackByKey("p20");
    if (!p20) throw new Error("p20 pack missing from catalog");
    expect(getPackForeignCents(p20, 0.79)).toBe(1580);
});

test("pack descriptions stay aligned with the shared catalog", () => {
    const lastPack = POLLEN_PACKS[POLLEN_PACKS.length - 1];

    expect(POLLEN_PACKS[0]?.checkoutName).toBe("🪷 2 Pollen");
    expect(POLLEN_PACKS[0]?.checkoutDescription).toContain(
        "Tiny bits of creative energy for pollinations.ai",
    );
    expect(POLLEN_PACKS[0]?.checkoutDescription).not.toContain("extra Pollen");
    expect(POLLEN_PACKS[1]?.checkoutName).toBe("🪷 5 Pollen + 1 FREE");
    expect(POLLEN_PACKS[1]?.checkoutDescription).toContain(
        "We’re still in beta, so this pack includes 1 extra Pollen when you buy 5.",
    );
    expect(POLLEN_PACKS[0]?.checkoutImageUrl).toBe(
        "https://enter.pollinations.ai/checkout/pollen-pack.png",
    );
    expect(POLLEN_PACKS[0]?.taxCode).toBe("txcd_10103001");
    expect(POLLEN_PACKS[0]?.checkoutDescription).toContain(
        "https://discord.gg/z5uMbEYK",
    );
    expect(describePollenPack(lastPack)).toBe("$100 -> 160 pollen (+60 bonus)");
    expect(describePollenPack(POLLEN_PACKS[0])).toBe("$2 -> 2 pollen");
});
