import { describe, expect, it } from "vitest";
import {
    filterBySource,
    healthFor,
    isReliable,
} from "@/routes/proxy.ts";
import { RELIABLE_SUCCESS_RATE_THRESHOLD } from "@/schemas/models.ts";
import type { GenerationModelEntry } from "@/model-registry.ts";

function fakeEntry(community: boolean): GenerationModelEntry {
    return {
        communityEndpoint: community
            ? ({ visibility: "public" } as never)
            : undefined,
    } as unknown as GenerationModelEntry;
}

const INFO_NAME = "openai/gpt-5.4-nano";

const HEALTH_ROWS = [
    {
        model: INFO_NAME,
        event_type: "generate.text",
        total_requests: 100,
        status_2xx: 80,
        errors_4xx: 10,
        errors_5xx: 10,
        fallback_rescues: 3,
    },
];

const OPTIONS = { timestamp: 1760000000000, minutes: 60 };

describe("source filtering", () => {
    const entries = [
        fakeEntry(false),
        fakeEntry(true),
        fakeEntry(false),
        fakeEntry(true),
    ];

    it("keeps everything when the source is omitted", () => {
        expect(filterBySource(entries, undefined)).toHaveLength(4);
    });

    it("keeps only built-in entries for official", () => {
        const official = filterBySource(entries, "official");
        expect(official).toHaveLength(2);
        expect(official.every((e) => e.communityEndpoint === undefined)).toBe(
            true,
        );
    });

    it("keeps only community entries for community", () => {
        const community = filterBySource(entries, "community");
        expect(community).toHaveLength(2);
        expect(community.every((e) => e.communityEndpoint !== undefined)).toBe(
            true,
        );
    });
});

describe("model health metadata", () => {
    it("counts fallback rescues as successes and excludes caller-side failures", () => {
        const health = healthFor(
            { name: INFO_NAME } as never,
            HEALTH_ROWS,
            OPTIONS,
        );
        // successes = status_2xx + fallback_rescues = 83
        // attempts = total_requests - errors_4xx = 90
        expect(health?.success_rate).toBeCloseTo(83 / 90);
        expect(health?.samples).toBe(100);
        expect(health?.window_minutes).toBe(60);
        expect(new Date(health?.as_of ?? "").getTime()).toBe(
            OPTIONS.timestamp,
        );
    });

    it("means unknown without health rows", () => {
        const info = { name: "unknown/model" } as never;
        expect(healthFor(info, HEALTH_ROWS, OPTIONS)).toBeUndefined();
    });

    it("means unknown for a model with no successful attempts", () => {
        const empty = healthFor(
            { name: INFO_NAME } as never,
            [
                {
                    model: INFO_NAME,
                    event_type: "generate.text",
                    total_requests: 0,
                    status_2xx: 0,
                    errors_4xx: 0,
                    errors_5xx: 0,
                    fallback_rescues: 0,
                },
            ],
            OPTIONS,
        );
        expect(empty).toBeUndefined();
    });
});

describe("reliability filter", () => {
    it("requires a success rate at or above the threshold", () => {
        const atThreshold = isReliable({
            name: INFO_NAME,
            health: {
                success_rate: RELIABLE_SUCCESS_RATE_THRESHOLD,
                samples: 100,
                window_minutes: 60,
                as_of: "2026-09-11T00:00:00.000Z",
            },
        } as never);
        expect(atThreshold).toBe(true);

        const below = isReliable({
            name: INFO_NAME,
            health: {
                success_rate: RELIABLE_SUCCESS_RATE_THRESHOLD - 0.05,
                samples: 100,
                window_minutes: 60,
                as_of: "2026-09-11T00:00:00.000Z",
            },
        } as never);
        expect(below).toBe(false);
    });

    it("means not reliable when health data is missing", () => {
        expect(isReliable({ name: INFO_NAME } as never)).toBe(false);
    });
});
