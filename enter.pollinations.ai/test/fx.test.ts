import { afterEach, describe, expect, test, vi } from "vitest";
import {
    getEurMidRate,
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

describe("usdToEurCents", () => {
    test("converts at mid-market, rounds to cent", () => {
        expect(usdToEurCents(5, 1.08)).toBe(463); // 5/1.08=4.6296 -> €4.63
        expect(usdToEurCents(20, 1.155)).toBe(1732); // 20/1.155=17.316 -> €17.32
    });
});

const ecbXml = (rate: string) => `<Cube currency='USD' rate='${rate}'/>`;

afterEach(() => vi.unstubAllGlobals());

describe("getEurMidRate", () => {
    test("returns the live ECB rate", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(ecbXml("1.1550"), { status: 200 })),
        );
        expect(await getEurMidRate()).toBeCloseTo(1.155, 4);
    });

    test("throws on non-ok response", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response("", { status: 503 })),
        );
        await expect(getEurMidRate()).rejects.toThrow(/HTTP 503/);
    });

    test("throws when the USD rate is missing", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response("not xml", { status: 200 })),
        );
        await expect(getEurMidRate()).rejects.toThrow(/no USD rate/);
    });

    test("propagates a network failure", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new Error("net");
            }),
        );
        await expect(getEurMidRate()).rejects.toThrow("net");
    });
});
