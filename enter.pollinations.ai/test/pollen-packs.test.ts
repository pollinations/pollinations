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
        2, 6, 13, 28, 75, 160,
    ]);
});

test("pack lookup validates supported checkout amounts", () => {
    expect(isPollenPackAmount("2")).toBe(true);
    expect(isPollenPackAmount("3")).toBe(false);
    expect(getPollenPack("20")?.bonusPollen).toBe(8);
    expect(getPollenPack(100)?.pollenGrant).toBe(160);
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
        "https://enter.myceli.ai/checkout/pollen-pack.png",
    );
    expect(POLLEN_PACKS[0]?.taxCode).toBe("txcd_10103001");
    expect(POLLEN_PACKS[0]?.checkoutDescription).toContain(
        "https://discord.gg/z5uMbEYK",
    );
    expect(describePollenPack(lastPack)).toBe("$100 -> 160 pollen (+60 bonus)");
    expect(describePollenPack(POLLEN_PACKS[0])).toBe("$2 -> 2 pollen");
});
