import {
    type ModelHealthRow,
    modelReliability,
    summarizeModelHealth,
} from "@shared/registry/model-health.ts";
import { describe, expect, it } from "vitest";
import {
    filterEntriesByReliability,
    parseReliabilityParam,
    parseSourceHeader,
} from "../src/model-health.ts";
import type { GenerationModelEntry } from "../src/model-registry.ts";

function row(overrides: Partial<ModelHealthRow> = {}): ModelHealthRow {
    return {
        model: "openai",
        total_requests: 100,
        status_2xx: 98,
        errors_4xx: 2,
        fallback_rescues: 0,
        last_request_at: "2026-09-09T23:00:00",
        ...overrides,
    };
}

function entry(id: string, communityEndpoint?: unknown): GenerationModelEntry {
    return {
        id,
        info: { name: id },
        communityEndpoint,
    } as unknown as GenerationModelEntry;
}

describe("summarizeModelHealth", () => {
    it("computes the rate over non-caller-failure traffic", () => {
        // (98 + 0) / (100 - 2) = 1.0
        expect(summarizeModelHealth([row()], "openai", 60)).toEqual({
            success_rate: 1,
            sample_count: 98,
            window_minutes: 60,
            last_request_at: "2026-09-09T23:00:00",
        });
    });

    it("counts fallback rescues as successes", () => {
        // (90 + 5) / (100 - 2) = 0.9694
        const summary = summarizeModelHealth(
            [row({ status_2xx: 90, fallback_rescues: 5 })],
            "openai",
            60,
        );
        expect(summary?.success_rate).toBeCloseTo(0.9694, 4);
    });

    it("clamps the rate at 1 when rescues overlap 2xx", () => {
        const summary = summarizeModelHealth(
            [row({ status_2xx: 98, fallback_rescues: 5 })],
            "openai",
            60,
        );
        expect(summary?.success_rate).toBe(1);
    });

    it("returns null with no row or no evaluated traffic", () => {
        expect(summarizeModelHealth([], "openai", 60)).toBeNull();
        expect(
            summarizeModelHealth([row({ model: "other" })], "openai", 60),
        ).toBeNull();
        expect(
            summarizeModelHealth(
                [row({ total_requests: 5, errors_4xx: 5, status_2xx: 0 })],
                "openai",
                60,
            ),
        ).toBeNull();
    });
});

describe("modelReliability", () => {
    it("marks high-rate, well-sampled models reliable", () => {
        expect(
            modelReliability({
                success_rate: 0.97,
                sample_count: 200,
                window_minutes: 60,
                last_request_at: null,
            }),
        ).toBe("reliable");
    });

    it("marks low-rate models unreliable", () => {
        expect(
            modelReliability({
                success_rate: 0.75,
                sample_count: 200,
                window_minutes: 60,
                last_request_at: null,
            }),
        ).toBe("unreliable");
    });

    it("reports unknown without data or with thin samples", () => {
        expect(modelReliability(null)).toBe("unknown");
        expect(
            modelReliability({
                success_rate: 1,
                sample_count: 5,
                window_minutes: 60,
                last_request_at: null,
            }),
        ).toBe("unknown");
    });
});

describe("parseReliabilityParam", () => {
    it("defaults to all and lets query win over headers", () => {
        expect(parseReliabilityParam(undefined, undefined)).toBe("all");
        expect(parseReliabilityParam("reliable", "all")).toBe("reliable");
        expect(parseReliabilityParam(undefined, "reliable")).toBe("reliable");
    });

    it("rejects unknown values", () => {
        expect(() => parseReliabilityParam("sometimes", undefined)).toThrow(
            /reliability must be/,
        );
    });
});

describe("parseSourceHeader", () => {
    it("maps official/community/all onto the community param", () => {
        expect(parseSourceHeader(undefined, undefined)).toBeUndefined();
        expect(parseSourceHeader("true", "official")).toBe("true");
        expect(parseSourceHeader(undefined, "official")).toBe("false");
        expect(parseSourceHeader(undefined, "community")).toBe("true");
        expect(parseSourceHeader(undefined, "all")).toBeUndefined();
    });

    it("rejects unknown values", () => {
        expect(() => parseSourceHeader(undefined, "private")).toThrow(
            /X-Model-Source must be/,
        );
    });
});

describe("filterEntriesByReliability", () => {
    const attachments = new Map([
        ["good", { reliability: "reliable" as const, health: null }],
        ["bad", { reliability: "unreliable" as const, health: null }],
    ]);

    it("keeps everything by default", () => {
        const entries = [entry("good"), entry("bad"), entry("new")];
        expect(filterEntriesByReliability(entries, "all", attachments)).toEqual(
            entries,
        );
    });

    it("keeps only reliable models, unknown never matches", () => {
        const entries = [entry("good"), entry("bad"), entry("new")];
        expect(
            filterEntriesByReliability(entries, "reliable", attachments).map(
                (e) => e.id,
            ),
        ).toEqual(["good"]);
    });
});
