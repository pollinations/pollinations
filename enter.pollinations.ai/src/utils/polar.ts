import { Polar } from "@polar-sh/sdk";
import { cached } from "@/cache.ts";
import { getLogger } from "@logtape/logtape";
import z from "zod";
import type { Product } from "@polar-sh/sdk/models/components/product.js";
import { addDays, differenceInDays } from "date-fns";

const PRODUCT_CACHE_TTL = 300; // 5 minutes in seconds

const log = getLogger(["hono", "polar"]);

export const packNames = ["5x2", "10x2", "20x2", "50x2"] as const;
export const packProductSlugPrefix = "v1:product:pack";

export type PackProductSlugPrefix = typeof packProductSlugPrefix;
export type PackName = (typeof packNames)[number];
export type PackProductSlug = `${PackProductSlugPrefix}:${PackName}`;

export function packProductSlugFromName(name: PackName): PackProductSlug {
    return `${packProductSlugPrefix}:${name}`;
}

export const packProductSlugs = packNames.map(packProductSlugFromName);

export const tierNames = [
    "spore",
    "seed",
    "flower",
    "nectar",
    "router",
] as const;
export const tierProductSlugPrefix = "v1:product:tier";

export function tierProductSlugFromName(name: TierName): TierProductSlug {
    return `${tierProductSlugPrefix}:${name}`;
}

export type TierName = (typeof tierNames)[number];
export type TierStatus = TierName | "none";
export type TierProductSlugPrefix = typeof tierProductSlugPrefix;
export type TierProductSlug = `${TierProductSlugPrefix}:${TierName}`;

export const tierProductSlugs = tierNames.map(tierProductSlugFromName);

export function isValidTier(tier: string): tier is TierName {
    return tierNames.includes(tier as TierName);
}

export function getTierStatus(userTier: string | null | undefined): TierStatus {
    const normalized = userTier?.toLowerCase();
    return tierNames.includes(normalized as TierName)
        ? (normalized as TierStatus)
        : "none";
}

export type TierProductMap = Record<TierProductSlug, Product>;
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

export async function getTierProductMapCached(
    polar: Polar,
    kv: KVNamespace,
): Promise<TierProductMap> {
    return await cached(getProductMap, {
        log,
        ttl: PRODUCT_CACHE_TTL,
        kv,
        keyGenerator: () => "polar:products:tier:map",
    })(polar, tierProductSlugs);
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

export function getTierProductById(
    productId: string | undefined,
    tierProductMap: TierProductMap,
): Product | null {
    if (!productId) return null;
    return (
        Object.entries(tierProductMap)
            .filter(([_, product]) => product.id === productId)
            .map(([_, product]) => product)
            .at(0) || null
    );
}

export function calculateNextPeriodStart(currentPeriodStart: Date): Date {
    const now = new Date();
    const daysPassed = differenceInDays(now, currentPeriodStart);
    const nextPeriodStart = addDays(currentPeriodStart, daysPassed + 1);
    return nextPeriodStart;
}
