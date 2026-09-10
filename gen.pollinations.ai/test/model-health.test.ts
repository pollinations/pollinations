import type { ModelHealth } from "@shared/schemas/openai.ts";
import { describe, expect, it } from "vitest";
import { processHealthRows } from "../src/utils/model-health.ts";

describe("processHealthRows", () => {
    it("calculates success_rate excluding 4xx and including fallback_rescues in 2xx", () => {
        const rows = [
            {
                model: "openai/gpt-4o",
                total_requests: 120,
                status_2xx: 90, // Includes fallback rescues
                errors_4xx: 20, // Caller errors (excluded)
                errors_5xx: 10,
                last_request_at: "2026-03-31T12:00:00Z",
            },
        ];

        const outMap = new Map<string, ModelHealth>();
        processHealthRows(rows, 60, outMap);

        const health = outMap.get("openai/gpt-4o");
        expect(health).toBeDefined();
        // sample_count = 90 + 10 = 100
        // success_rate = 90 / 100 = 0.9
        expect(health?.sample_count).toBe(100);
        expect(health?.success_rate).toBe(0.9);
        expect(health?.window_minutes).toBe(60);
        expect(health?.freshness).toBe("2026-03-31T12:00:00Z");
    });

    it("aggregates multiple rows for the same model across event_types", () => {
        const rows = [
            {
                model: "my-model",
                total_requests: 10,
                status_2xx: 8,
                errors_4xx: 2,
                errors_5xx: 2,
                last_request_at: "2026-03-31T11:00:00Z",
            },
            {
                model: "my-model",
                total_requests: 20,
                status_2xx: 18,
                errors_4xx: 5,
                errors_5xx: 2,
                last_request_at: "2026-03-31T12:00:00Z",
            },
        ];

        const outMap = new Map<string, ModelHealth>();
        processHealthRows(rows, 60, outMap);

        const health = outMap.get("my-model");
        expect(health).toBeDefined();
        // 2xx = 8 + 18 = 26
        // 5xx = 2 + 2 = 4
        // sample_count = 30
        // success_rate = 26/30 ~ 0.8667
        expect(health?.sample_count).toBe(30);
        expect(health?.success_rate).toBeCloseTo(0.8667, 3);
        expect(health?.freshness).toBe("2026-03-31T12:00:00Z");
    });
});
