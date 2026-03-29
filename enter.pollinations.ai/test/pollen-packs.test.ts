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
        2.5, 7, 15, 30, 90, 200,
    ]);
});

test("pack lookup validates supported checkout amounts", () => {
    expect(isPollenPackAmount("2")).toBe(true);
    expect(isPollenPackAmount("3")).toBe(false);
    expect(getPollenPack("20")?.bonusPollen).toBe(10);
    expect(getPollenPack(100)?.pollenGrant).toBe(200);
});

test("pack descriptions stay aligned with the shared catalog", () => {
    const lastPack = POLLEN_PACKS[POLLEN_PACKS.length - 1];

    expect(POLLEN_PACKS[0]?.checkoutName).toBe("🐝 2 Pollen + 0.5 FREE");
    expect(POLLEN_PACKS[0]?.checkoutDescription).toContain(
        "0.5 extra Pollen when you buy 2 Pollen, for 2.5 total.",
    );
    expect(POLLEN_PACKS[0]?.checkoutImageUrl).toBe(
        "https://enter.pollinations.ai/icon-512.png",
    );
    expect(POLLEN_PACKS[0]?.taxCode).toBe("txcd_10103001");
    expect(POLLEN_PACKS[0]?.checkoutDescription).toContain(
        "come hang out with us on Discord",
    );
    expect(describePollenPack(lastPack)).toBe(
        "$100 -> 200 pollen (+100 bonus)",
    );
});
