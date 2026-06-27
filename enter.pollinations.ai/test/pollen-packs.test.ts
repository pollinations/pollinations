import {
    describePollenPack,
    formatPollenPackValue,
    getPollenPackByAmount,
    getPollenPackByKey,
    isPollenPackKey,
    POLLEN_PACKS,
} from "@shared/pollen-packs.ts";
import { expect, test } from "vitest";

test("pollen pack catalog has unique positive USD-denominated pack keys", () => {
    const packKeys = new Set(POLLEN_PACKS.map((pack) => pack.packKey));
    const amounts = new Set(POLLEN_PACKS.map((pack) => pack.amountUsd));

    expect(POLLEN_PACKS.length).toBeGreaterThan(0);
    expect(packKeys.size).toBe(POLLEN_PACKS.length);
    expect(amounts.size).toBe(POLLEN_PACKS.length);

    for (const pack of POLLEN_PACKS) {
        expect(pack.amountUsd).toBeGreaterThan(0);
        expect(pack.packKey).toBe(`p${pack.amountUsd}`);
    }
});

test("pack lookup validates supported USD amounts", () => {
    for (const pack of POLLEN_PACKS) {
        expect(getPollenPackByAmount(pack.amountUsd)).toBe(pack);
    }

    const unsupportedAmount =
        Math.max(...POLLEN_PACKS.map((pack) => pack.amountUsd)) + 1;
    expect(getPollenPackByAmount(unsupportedAmount)).toBeUndefined();
    expect(getPollenPackByAmount(null)).toBeUndefined();
});

test("pack lookup validates pack keys", () => {
    for (const pack of POLLEN_PACKS) {
        expect(isPollenPackKey(pack.packKey)).toBe(true);
        expect(getPollenPackByKey(pack.packKey)).toBe(pack);
    }

    expect(getPollenPackByKey("20")).toBeUndefined();
    expect(getPollenPackByKey("nope")).toBeUndefined();
    expect(isPollenPackKey("nope")).toBe(false);
});

test("pack descriptions stay aligned with the shared catalog", () => {
    for (const pack of POLLEN_PACKS) {
        const formattedAmount = formatPollenPackValue(pack.amountUsd);

        expect(pack.checkoutName).toContain(formattedAmount);
        expect(pack.checkoutDescription).not.toHaveLength(0);
        expect(() => new URL(pack.checkoutImageUrl)).not.toThrow();
        expect(pack.taxCode).not.toHaveLength(0);
        expect(describePollenPack(pack)).toBe(
            `$${pack.amountUsd} -> ${formattedAmount} pollen`,
        );
    }
});
