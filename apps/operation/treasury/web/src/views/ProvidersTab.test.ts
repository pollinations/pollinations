import { describe, expect, it } from "vitest";
import { buildAliasChange } from "./ProvidersTab";

describe("buildAliasChange", () => {
    it("builds a provider_aliases row, lowercasing alias and provider", () => {
        expect(
            buildAliasChange({
                alias: "AMAZON WEB SERVICES EMEA",
                enteredAt: "2026-07-04 12:00:00",
                provider: "AWS",
            }),
        ).toEqual({
            datasource: "provider_aliases",
            key: "provider_aliases:amazon web services emea",
            row: {
                entered_at: "2026-07-04 12:00:00",
                alias: "amazon web services emea",
                provider: "aws",
                category: "",
                note: "",
            },
            summary: "alias amazon web services emea -> aws",
        });
    });

    it("keeps a stable staging key for a draft while marking removals", () => {
        const change = buildAliasChange({
            alias: "retell ai",
            enteredAt: "2026-07-04 12:00:00",
            provider: "",
            stageKey: "provider_aliases:new:abc",
        });
        expect(change.key).toBe("provider_aliases:new:abc");
        expect(change.row.provider).toBe("");
        expect(change.summary).toBe("alias retell ai -> (removed)");
    });
});
