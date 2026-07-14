import {
    type ModelHealthRow,
    mapModelHealthRows,
} from "@frontend/components/models/model-health.tsx";
import { describe, expect, it } from "vitest";

const row = (overrides: Partial<ModelHealthRow> = {}): ModelHealthRow => ({
    model: "owner/model",
    event_type: "generate.text",
    total_requests: 120,
    status_2xx: 99,
    errors_4xx: 10,
    tokens_per_second: 72.4,
    ...overrides,
});

describe("mapModelHealthRows", () => {
    it("calculates success from requests eligible to reach the provider", () => {
        expect(mapModelHealthRows([row()])).toEqual({
            "owner/model": {
                eligibleRequests: 110,
                successfulRequests: 99,
                successRate: 90,
                tokensPerSecond: 72.4,
            },
        });
    });

    it("keeps missing speed data while filtering unrelated health rows", () => {
        expect(
            mapModelHealthRows([
                row({ model: "openai" }),
                row({ event_type: "generate.image" }),
                row({
                    model: "owner/quiet-model",
                    total_requests: 15,
                    status_2xx: 5,
                    errors_4xx: 10,
                    tokens_per_second: null,
                }),
                row({
                    model: "owner/client-errors-only",
                    total_requests: 10,
                    status_2xx: 0,
                    errors_4xx: 10,
                }),
            ]),
        ).toEqual({
            "owner/quiet-model": {
                eligibleRequests: 5,
                successfulRequests: 5,
                successRate: 100,
                tokensPerSecond: null,
            },
        });
    });
});
