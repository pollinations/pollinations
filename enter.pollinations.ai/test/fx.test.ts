import { afterEach, describe, expect, test, vi } from "vitest";
import {
    EUR_USD_FLOOR,
    FX_RATE_MAX,
    FX_RATE_MIN,
    getEurMidRate,
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

// Minimal in-memory KV so the ladder is testable without miniflare semantics.
function fakeKv(initial: Record<string, string> = {}) {
    const store = new Map(Object.entries(initial));
    return {
        store,
        get: vi.fn(async (k: string) => store.get(k) ?? null),
        put: vi.fn(async (k: string, v: string) => void store.set(k, v)),
    };
}
const envWith = (kv: ReturnType<typeof fakeKv>) =>
    ({ KV: kv }) as unknown as CloudflareBindings;

const ecbXml = (rate: string) => `<Cube currency='USD' rate='${rate}'/>`;

afterEach(() => vi.unstubAllGlobals());

describe("getEurMidRate", () => {
    test("returns cached current rate without fetching", async () => {
        const kv = fakeKv({ "fx:eur-usd:current": "1.142" });
        const fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);
        expect(await getEurMidRate(envWith(kv))).toBeCloseTo(1.142, 4);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    test("fetches, clamps, caches current + last-good on cold cache", async () => {
        const kv = fakeKv();
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(ecbXml("1.1550"), { status: 200 })),
        );
        expect(await getEurMidRate(envWith(kv))).toBeCloseTo(1.155, 4);
        expect(kv.store.get("fx:eur-usd:current")).toBe("1.155");
        expect(kv.store.get("fx:eur-usd:last-good")).toBe("1.155");
    });

    test("rejects implausible fetched rate -> last-good", async () => {
        const kv = fakeKv({ "fx:eur-usd:last-good": "1.10" });
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(ecbXml("115.5"), { status: 200 })),
        );
        expect(await getEurMidRate(envWith(kv))).toBeCloseTo(1.1, 4);
    });

    test("fetch failure with no last-good -> floor", async () => {
        const kv = fakeKv();
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new Error("net");
            }),
        );
        expect(await getEurMidRate(envWith(kv))).toBe(EUR_USD_FLOOR);
    });
});
