import { describe, expect, test } from "vitest";
import {
    EUR_USD_FLOOR,
    FX_RATE_MAX,
    FX_RATE_MIN,
    isPlausibleRate,
    parseEcbUsdRate,
    usdToEurCents,
} from "../src/utils/fx.ts";

describe("parseEcbUsdRate", () => {
    const xml = `<gesmes:Envelope><Cube><Cube time='2026-06-10'>
        <Cube currency='USD' rate='1.1550'/>
        <Cube currency='JPY' rate='168.42'/>
    </Cube></Cube></gesmes:Envelope>`;

    test("extracts the USD rate", () => {
        expect(parseEcbUsdRate(xml)).toBeCloseTo(1.155, 4);
    });
    test("returns null when USD absent", () => {
        expect(parseEcbUsdRate("<Cube currency='JPY' rate='168'/>")).toBeNull();
    });
    test("returns null on garbage", () => {
        expect(parseEcbUsdRate("not xml")).toBeNull();
    });
});

describe("isPlausibleRate", () => {
    test.each([0.95, 1.0, 1.155, 1.49])("accepts %s", (r) => {
        expect(isPlausibleRate(r)).toBe(true);
    });
    test.each([
        0,
        -1,
        0.0115,
        115.5,
        FX_RATE_MIN - 0.01,
        FX_RATE_MAX + 0.01,
        Number.NaN,
    ])("rejects %s", (r) => {
        expect(isPlausibleRate(r)).toBe(false);
    });
});

describe("usdToEurCents", () => {
    test("converts at mid-market, rounds to cent", () => {
        expect(usdToEurCents(5, 1.08)).toBe(463); // 5/1.08=4.6296 -> €4.63
        expect(usdToEurCents(20, 1.155)).toBe(1732); // 20/1.155=17.316 -> €17.32
    });
    test("floor is within the plausible band", () => {
        expect(isPlausibleRate(EUR_USD_FLOOR)).toBe(true);
    });
});
