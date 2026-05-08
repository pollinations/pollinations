import { expect, test } from "vitest";
import {
    describePollenPack,
    getPollenPack,
    isPollenPackAmount,
    POLLEN_PACKS,
} from "@/pollen-packs.ts";

test("pollen pack catalog includes the stepped beta bonus ladder", () => {
    expect(POLLEN_PACKS.map((pack) => pack.amountUsd)).toEqual([
        2, 5, 10, 20, 50, 100,
    ]);
    expect(POLLEN_PACKS.map((pack) => pack.pollenGrant)).toEqual([
        2, 5.5, 12, 26, 70, 150,
    ]);
});

test("pack lookup validates supported checkout amounts", () => {
    expect(isPollenPackAmount("2")).toBe(true);
    expect(isPollenPackAmount("3")).toBe(false);
    expect(getPollenPack("20")?.bonusPollen).toBe(6);
    expect(getPollenPack(100)?.pollenGrant).toBe(150);
});

test("pack descriptions stay aligned with the shared catalog", () => {
    const lastPack = POLLEN_PACKS[POLLEN_PACKS.length - 1];
    const bonusPack = POLLEN_PACKS[1];

    expect(POLLEN_PACKS[0]?.checkoutName).toBe("🪷 2 Pollen");
    expect(POLLEN_PACKS[0]?.checkoutDescription).toContain(
        "Tiny bits of creative energy for pollinations.ai",
    );
    expect(POLLEN_PACKS[0]?.checkoutDescription).not.toContain(
        "extra Pollen when you buy",
    );
    expect(POLLEN_PACKS[0]?.checkoutImageUrl).toBe(
        "https://enter.pollinations.ai/checkout/pollen-pack.png",
    );
    expect(POLLEN_PACKS[0]?.taxCode).toBe("txcd_10103001");
    expect(POLLEN_PACKS[0]?.checkoutDescription).toContain(
        "https://discord.gg/z5uMbEYK",
    );
    expect(bonusPack?.checkoutName).toBe("🪷 5 Pollen + 0.5 FREE");
    expect(bonusPack?.checkoutDescription).toContain(
        "We’re still in beta, so this pack includes 0.5 extra Pollen when you buy 5.",
    );
    expect(describePollenPack(lastPack)).toBe("$100 -> 150 pollen (+50 bonus)");
});
