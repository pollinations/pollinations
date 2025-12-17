import { getLogger } from "@logtape/logtape";
import type { Polar } from "@polar-sh/sdk";

const log = getLogger(["hono", "tier-products"]);

const VERSION = "v1";

export type TierName = "spore" | "seed" | "flower" | "nectar" | "router";

export interface TierProductMap {
    spore: string;
    seed: string;
    flower: string;
    nectar: string;
    router: string;
}

const TIER_SLUGS: TierName[] = ["spore", "seed", "flower", "nectar", "router"];

/**
 * Fetches tier product IDs from Polar by their metadata slugs.
 * Products are identified by metadata: { slug: "v1:product:tier:{tierName}" }
 */
export async function fetchTierProductMap(
    polar: Polar,
): Promise<TierProductMap> {
    const slugs = TIER_SLUGS.map((tier) => `${VERSION}:product:tier:${tier}`);

    log.debug("Fetching tier products from Polar with slugs: {slugs}", {
        slugs,
    });

    const response = await polar.products.list({
        limit: 100,
        metadata: {
            slug: slugs,
        },
    });

    const productMap: Partial<TierProductMap> = {};

    for (const product of response.result.items) {
        const slug = product.metadata?.slug as string | undefined;
        if (!slug) continue;

        // Extract tier name from slug: "v1:product:tier:spore" -> "spore"
        const tierMatch = slug.match(/^v1:product:tier:(\w+)$/);
        if (tierMatch && TIER_SLUGS.includes(tierMatch[1] as TierName)) {
            const tierName = tierMatch[1] as TierName;
            productMap[tierName] = product.id;
            log.debug("Found tier product: {tier} = {id}", {
                tier: tierName,
                id: product.id,
            });
        }
    }

    // Validate all tiers were found
    const missingTiers = TIER_SLUGS.filter((tier) => !productMap[tier]);
    if (missingTiers.length > 0) {
        log.warn("Missing tier products in Polar: {tiers}", {
            tiers: missingTiers,
        });
    }

    return productMap as TierProductMap;
}

// In-memory cache for tier products (per-request lifetime in Workers)
let cachedProductMap: TierProductMap | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Gets tier product map with in-memory caching.
 * Cache is per-isolate and refreshes every 5 minutes.
 */
export async function getTierProductMapCached(
    polar: Polar,
): Promise<TierProductMap> {
    const now = Date.now();

    if (cachedProductMap && now - cacheTimestamp < CACHE_TTL_MS) {
        return cachedProductMap;
    }

    cachedProductMap = await fetchTierProductMap(polar);
    cacheTimestamp = now;

    return cachedProductMap;
}

/**
 * Validates if a string is a valid tier name.
 */
export function isValidTier(tier: string): tier is TierName {
    return TIER_SLUGS.includes(tier as TierName);
}
