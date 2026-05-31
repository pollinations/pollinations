import {
    describePollenPack,
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

test("pack lookup validates supported USD amounts", () => {
    expect(getPollenPackByAmount(20)?.bonusPollen).toBe(8);
    expect(getPollenPackByAmount(100)?.pollenGrant).toBe(160);
    expect(getPollenPackByAmount(3)).toBeUndefined();
});

test("pack lookup validates pack keys", () => {
    expect(isPollenPackKey("p20")).toBe(true);
    expect(isPollenPackKey("p3")).toBe(false);
    expect(getPollenPackByKey("p20")?.bonusPollen).toBe(8);
    expect(getPollenPackByKey("p100")?.pollenGrant).toBe(160);
    expect(getPollenPackByKey("20")).toBeUndefined();
    expect(getPollenPackByKey("nope")).toBeUndefined();
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
