import {
    communityEndpointPrices,
    communityModelDefinition,
} from "@shared/community-endpoints.ts";
import { getRegistryModelDefinition } from "@shared/registry/registry.ts";
import type { TinybirdModelStats } from "@shared/utils/model-stats.ts";
import { describe, expect, it } from "vitest";
import { getEstimatedPrice } from "@/utils/model-stats.ts";

// Historical averages far above the real price: this is what tripped the
// pre-flight balance check for flat-rate models.
const stats: TinybirdModelStats = {
    data: [
        { model: "voodoohop/flux", avg_cost_usd: 33.34 },
        { model: "voodoohop/gptimage", avg_cost_usd: 0.5 },
        { model: "trellis-2-low", avg_cost_usd: 12 },
    ],
};

describe("getEstimatedPrice", () => {
    it("uses the defined price for a flat-rate community model", () => {
        const definition = communityModelDefinition({
            modelId: "voodoohop/flux",
            description: null,
            modality: "image",
            ...communityEndpointPrices({ completionImagePrice: 0.01 }),
        });

        expect(getEstimatedPrice(stats, "voodoohop/flux", definition)).toBe(
            0.01,
        );
    });

    it("uses the defined price for a flat-rate registry model", () => {
        expect(
            getEstimatedPrice(
                stats,
                "trellis-2-low",
                getRegistryModelDefinition("trellis-2-low"),
            ),
        ).toBe(0.24);
    });

    it("falls back to the historical average for token-priced models", () => {
        const definition = communityModelDefinition({
            modelId: "voodoohop/gptimage",
            description: null,
            modality: "image",
            imagePricing: "tokens",
            ...communityEndpointPrices({ completionImagePrice: 0.00004 }),
        });

        expect(getEstimatedPrice(stats, "voodoohop/gptimage", definition)).toBe(
            0.5,
        );
    });
});
