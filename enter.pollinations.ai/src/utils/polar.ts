import { getLogger } from "@logtape/logtape";
import type { Polar } from "@polar-sh/sdk";
import type { Product } from "@polar-sh/sdk/models/components/product.js";
import z from "zod";
import { cached } from "@/cache.ts";

const PRODUCT_CACHE_TTL = 300; // 5 minutes in seconds

const log = getLogger(["hono", "polar"]);

// ============ PACK PRODUCTS (Polar checkout fallback + webhooks) ============
export const packNames = ["5x2", "10x2", "20x2", "50x2"] as const;
export const packProductSlugPrefix = "v1:product:pack";

export type PackProductSlugPrefix = typeof packProductSlugPrefix;
export type PackName = (typeof packNames)[number];
export type PackProductSlug = `${PackProductSlugPrefix}:${PackName}`;

export function packProductSlugFromName(name: PackName): PackProductSlug {
    return `${packProductSlugPrefix}:${name}`;
}

export const packProductSlugs = packNames.map(packProductSlugFromName);

export type PackProductMap = Record<PackProductSlug, Product>;

async function getProductMap(polar: Polar, slugs: string[]) {
    const response = await polar.products.list({
        limit: 100,
        metadata: {
            slug: [...slugs],
        },
    });
    const slugMetadataSchema = z.object({
        slug: z.string(),
    });
    const entries = response.result.items.map((product) => {
        const productSlug = slugMetadataSchema.parse(product.metadata).slug;
        return [productSlug, product];
    });
    return Object.fromEntries(entries);
}

export async function getPackProductMapCached(
    polar: Polar,
    kv: KVNamespace,
): Promise<PackProductMap> {
    return await cached(getProductMap, {
        log,
        ttl: PRODUCT_CACHE_TTL,
        kv,
        keyGenerator: () => "polar:products:pack:map",
    })(polar, packProductSlugs);
}

// ============ TIER TYPES (D1-only, no Polar) ============
// Note: Tier management moved to D1 + cron job (see tier-config.ts)
// These types are still used for D1 tier logic

export const tierNames = [
    "spore",
    "seed",
    "flower",
    "nectar",
    "router",
] as const;

export type TierName = (typeof tierNames)[number];
export type TierStatus = TierName | "none";

// Re-export isValidTier from tier-config.ts for backwards compatibility
export { isValidTier } from "@/tier-config.ts";

export function getTierStatus(userTier: string | null | undefined): TierStatus {
    const normalized = userTier?.toLowerCase();
    return tierNames.includes(normalized as TierName)
        ? (normalized as TierStatus)
        : "none";
}
