import { describe, expect, it } from "vitest";
import {
    initialKeyEditValues,
    keyEditUpdates,
} from "../frontend/src/components/keys/key-edit-values.ts";
import type { ApiKey } from "../frontend/src/components/keys/types.ts";

const openedAt = Date.parse("2030-01-01T00:00:00Z");
const savedAt = openedAt + 3600000;
const key: ApiKey = {
    id: "edit-test",
    name: "Example app",
    createdAt: "2029-01-01T00:00:00Z",
    expiresAt: "2030-01-07T23:54:52.123Z",
    pollenBalance: 4.9987342,
    permissions: { models: ["text", "image"], account: ["profile", "usage"] },
    metadata: null,
};

describe("key editor updates", () => {
    it("rounds the displayed days without extending or rounding the stored deadline on save", () => {
        const initial = initialKeyEditValues(key, openedAt);
        expect(initial.expiryDays).toBe(7);
        expect(
            keyEditUpdates(initial, { ...initial, name: "Renamed" }, savedAt),
        ).toEqual({ name: "Renamed" });
        expect(keyEditUpdates(initial, { ...initial }, savedAt)).toEqual({});
    });

    it("sends intentional limit changes, including zero budget and clearing limits", () => {
        const initial = initialKeyEditValues(key, openedAt);
        expect(
            keyEditUpdates(
                initial,
                { ...initial, pollenBudget: 0, expiryDays: 0.5 },
                savedAt,
            ),
        ).toEqual({
            pollenBudget: 0,
            expiresAt: new Date(savedAt + 43200000),
        });
        expect(
            keyEditUpdates(
                initial,
                { ...initial, pollenBudget: null, expiryDays: null },
                savedAt,
            ),
        ).toEqual({
            pollenBudget: null,
            expiresAt: null,
        });
    });

    it("sends permission changes without resending unchanged limits", () => {
        const initial = initialKeyEditValues(key, openedAt);
        expect(
            keyEditUpdates(
                initial,
                {
                    ...initial,
                    allowedModels: [],
                    accountPermissions: [],
                    questPollenOnly: true,
                },
                savedAt,
            ),
        ).toEqual({
            allowedModels: [],
            accountPermissions: [],
            questPollenOnly: true,
        });
    });

    it("preserves expired keys and exhausted budgets when renaming", () => {
        const initial = initialKeyEditValues(
            {
                ...key,
                expiresAt: "2029-12-31T00:00:00Z",
                pollenBalance: -0.0003,
            },
            openedAt,
        );
        expect(initial.expiryDays).toBe(0);
        expect(
            keyEditUpdates(initial, { ...initial, name: "Expired" }, savedAt),
        ).toEqual({ name: "Expired" });
    });

    it("preserves absent limits and permissions on older keys", () => {
        const initial = initialKeyEditValues(
            { ...key, expiresAt: null, pollenBalance: null, permissions: null },
            openedAt,
        );
        expect(initial.expiryDays).toBeNull();
        expect(
            keyEditUpdates(initial, { ...initial, name: "Renamed" }, savedAt),
        ).toEqual({ name: "Renamed" });
    });

    it("edits only visible app-key fields and leaves hidden limits and permissions alone", () => {
        const initial = initialKeyEditValues(
            {
                ...key,
                metadata: {
                    keyType: "publishable",
                    redirectUris: ["https://example.invalid/callback"],
                    earningsEnabled: true,
                },
            },
            openedAt,
        );
        expect(initial).toEqual({
            name: key.name,
            redirectUris: ["https://example.invalid/callback"],
            earningsEnabled: true,
        });
        expect(
            keyEditUpdates(
                initial,
                { ...initial, earningsEnabled: false },
                savedAt,
            ),
        ).toEqual({ earningsEnabled: false });
    });
});
