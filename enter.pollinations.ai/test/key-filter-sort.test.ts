import { describe, expect, it } from "vitest";
import {
    filterKeys,
    sortKeys,
} from "../frontend/src/components/keys/key-filter-sort.ts";
import type { ApiKey } from "../frontend/src/components/keys/types.ts";

function key(overrides: Partial<ApiKey> = {}): ApiKey {
    return {
        id: overrides.id ?? "key",
        name: overrides.name ?? null,
        createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
        permissions: null,
        metadata: null,
        ...overrides,
    };
}

const ids = (keys: ApiKey[]) => keys.map((k) => k.id);

describe("key sorting", () => {
    it("orders by most recent use, never-used keys last", () => {
        const keys = [
            key({ id: "never" }),
            key({ id: "old", lastRequest: "2026-01-02T00:00:00.000Z" }),
            key({ id: "new", lastRequest: "2026-03-01T00:00:00.000Z" }),
        ];
        expect(ids(sortKeys(keys, "recently-used"))).toEqual([
            "new",
            "old",
            "never",
        ]);
    });

    it("orders by total spend, highest first", () => {
        const keys = [
            key({ id: "low", totalSpend: 1 }),
            key({ id: "zero" }),
            key({ id: "high", totalSpend: 5 }),
        ];
        expect(ids(sortKeys(keys, "spend"))).toEqual(["high", "low", "zero"]);
    });

    it("orders by smallest remaining budget first, uncapped last", () => {
        const keys = [
            key({ id: "uncapped", pollenBalance: null }),
            key({ id: "big", pollenBalance: 100 }),
            key({ id: "small", pollenBalance: 2 }),
        ];
        expect(ids(sortKeys(keys, "budget"))).toEqual([
            "small",
            "big",
            "uncapped",
        ]);
    });

    it("orders by newest creation date", () => {
        const keys = [
            key({ id: "older", createdAt: "2026-01-01T00:00:00.000Z" }),
            key({ id: "newer", createdAt: "2026-06-01T00:00:00.000Z" }),
        ];
        expect(ids(sortKeys(keys, "created"))).toEqual(["newer", "older"]);
    });

    it("does not mutate the input array", () => {
        const keys = [key({ id: "b" }), key({ id: "a" })];
        sortKeys(keys, "name");
        expect(ids(keys)).toEqual(["b", "a"]);
    });
});

describe("key filtering", () => {
    it("matches name and key prefix case-insensitively", () => {
        const keys = [
            key({ id: "one", name: "Production", start: "sk_abc" }),
            key({ id: "two", name: "dev", byopClientKeyId: "pk_xyz" }),
        ];
        expect(ids(filterKeys(keys, "prod"))).toEqual(["one"]);
        expect(ids(filterKeys(keys, "PK_XY"))).toEqual(["two"]);
    });

    it("returns every key for a blank query", () => {
        const keys = [key({ id: "one" }), key({ id: "two" })];
        expect(ids(filterKeys(keys, "  "))).toEqual(["one", "two"]);
    });
});
