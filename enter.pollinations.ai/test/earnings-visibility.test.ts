import { describe, expect, test } from "vitest";
import type { ApiKey } from "../src/client/components/api-keys/types.ts";
import {
    getEarningsEnabledApps,
    shouldShowEarningsGraph,
} from "../src/client/components/usage-analytics/earnings-visibility.ts";

const baseKey: ApiKey = {
    id: "key-1",
    name: "Test key",
    createdAt: "2026-05-08T00:00:00.000Z",
    permissions: null,
    metadata: null,
};

describe("earnings visibility", () => {
    test("only treats named publishable keys as earnings apps", () => {
        const apps = getEarningsEnabledApps([
            {
                ...baseKey,
                id: "publishable",
                name: "Publishable app",
                metadata: {
                    keyType: "publishable",
                },
            },
            {
                ...baseKey,
                id: "secret",
                name: "Secret key",
                metadata: {
                    keyType: "secret",
                },
            },
            {
                ...baseKey,
                id: "unnamed",
                name: "",
                metadata: {
                    keyType: "publishable",
                },
            },
        ]);

        expect(apps).toEqual([{ id: "publishable", name: "Publishable app" }]);
    });

    test("hides earnings graph without enabled apps or positive earnings", () => {
        expect(
            shouldShowEarningsGraph({
                appCount: 0,
                totalPollen: 10,
                error: null,
            }),
        ).toBe(false);
        expect(
            shouldShowEarningsGraph({
                appCount: 1,
                totalPollen: 0,
                error: null,
            }),
        ).toBe(false);
        expect(
            shouldShowEarningsGraph({
                appCount: 1,
                totalPollen: 0.01,
                error: null,
            }),
        ).toBe(true);
        expect(
            shouldShowEarningsGraph({
                appCount: 1,
                totalPollen: 0,
                error: "Failed to fetch earnings data",
            }),
        ).toBe(true);
    });
});
