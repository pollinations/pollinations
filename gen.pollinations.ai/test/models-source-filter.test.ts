import { describe, it, expect } from "vitest";
import { filterEntriesByCommunityParam } from "../src/routes/proxy.ts";
import type { GenerationModelEntry } from "../src/model-registry.ts";

function entry(id: string, isCommunity: boolean): GenerationModelEntry {
    return {
        id,
        communityEndpoint: isCommunity
            ? ({ visibility: "public" } as unknown as GenerationModelEntry["communityEndpoint"])
            : undefined,
    } as unknown as GenerationModelEntry;
}

const OFFICIAL = entry("openai/gpt-5.4-nano", false);
const OFFICIAL2 = entry("deepseek/deepseek-v4-flash", false);
const COMMUNITY = entry("someone/model", true);

describe("filterEntriesByCommunityParam", () => {
    it("returns all when no filter", () => {
        const out = filterEntriesByCommunityParam(
            [OFFICIAL, OFFICIAL2, COMMUNITY], undefined, undefined);
        expect(out).toHaveLength(3);
    });

    it("filters source=official to built-in models", () => {
        const out = filterEntriesByCommunityParam(
            [OFFICIAL, OFFICIAL2, COMMUNITY], undefined, "official");
        expect(out.map((e) => e.id)).toEqual(["openai/gpt-5.4-nano", "deepseek/deepseek-v4-flash"]);
    });

    it("filters source=community to community models", () => {
        const out = filterEntriesByCommunityParam(
            [OFFICIAL, OFFICIAL2, COMMUNITY], undefined, "community");
        expect(out.map((e) => e.id)).toEqual(["someone/model"]);
    });

    it("source=all returns everything", () => {
        const out = filterEntriesByCommunityParam(
            [OFFICIAL, OFFICIAL2, COMMUNITY], "true", "all");
        expect(out).toHaveLength(3);
    });

    it("legacy community=true returns only community", () => {
        const out = filterEntriesByCommunityParam(
            [OFFICIAL, OFFICIAL2, COMMUNITY], "true", undefined);
        expect(out.map((e) => e.id)).toEqual(["someone/model"]);
    });

    it("legacy community=false returns only official", () => {
        const out = filterEntriesByCommunityParam(
            [OFFICIAL, OFFICIAL2, COMMUNITY], "false", undefined);
        expect(out.map((e) => e.id)).toEqual(["openai/gpt-5.4-nano", "deepseek/deepseek-v4-flash"]);
    });

    it("source wins over community param", () => {
        // community=true says community-only, but source=official overrides
        const out = filterEntriesByCommunityParam(
            [OFFICIAL, OFFICIAL2, COMMUNITY], "true", "official");
        expect(out.map((e) => e.id)).toEqual(["openai/gpt-5.4-nano", "deepseek/deepseek-v4-flash"]);
    });
});
