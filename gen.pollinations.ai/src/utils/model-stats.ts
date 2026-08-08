import type { CommunityEndpointRuntime } from "@shared/community-endpoints.ts";
import type { TinybirdModelStats } from "@shared/utils/model-stats.ts";

export function getEstimatedPrice(
    stats: TinybirdModelStats,
    model: string | undefined,
    communityEndpoint?: CommunityEndpointRuntime,
): number {
    if (!model) return 0;

    if (communityEndpoint) {
        const imagePricing = communityEndpoint.imagePricing ?? "request";
        const isRequestModeImage =
            imagePricing === "request" &&
            communityEndpoint.completionImagePrice > 0;
        if (isRequestModeImage) {
            return communityEndpoint.completionImagePrice;
        }
    }

    const row = stats.data?.find((r) => r.model === model);
    return row?.avg_cost_usd || 0;
}
