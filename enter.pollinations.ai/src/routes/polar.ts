import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import z from "zod";
import { getLogger } from "@logtape/logtape";
import { auth } from "../middleware/auth.ts";
import { polar } from "../middleware/polar.ts";
import { validator } from "../middleware/validator.ts";
import type { Env } from "../env.ts";
import { describeRoute } from "hono-openapi";
import type { Polar } from "@polar-sh/sdk";
import { drizzle } from "drizzle-orm/d1";
import { event } from "../db/schema/event.ts";
import { and, eq, gte, sql } from "drizzle-orm";
import { cached } from "../cache.ts";

const log = getLogger(["hono", "polar"]);

export const productSlugs = [
    "v1:product:pack:5x2",
    "v1:product:pack:10x2",
    "v1:product:pack:20x2",
    "v1:product:pack:50x2",
] as const;

export const tierSlugs = [
    "v1:product:tier:spore",
    "v1:product:tier:seed",
    "v1:product:tier:flower",
    "v1:product:tier:nectar",
    "v1:product:tier:router",
] as const;

export type TierName = "spore" | "seed" | "flower" | "nectar" | "router";

export interface TierProductMap {
    spore: string;
    seed: string;
    flower: string;
    nectar: string;
    router: string;
}

export function isValidTier(tier: string): tier is TierName {
    return ["spore", "seed", "flower", "nectar", "router"].includes(tier);
}

const TIER_CACHE_TTL = 300; // 5 minutes in seconds

async function fetchTierProductMap(polar: Polar): Promise<TierProductMap> {
    const result = await polar.products.list({
        limit: 100,
        metadata: { slug: [...tierSlugs] },
    });
    const map: Partial<TierProductMap> = {};
    for (const product of result.result.items) {
        const tierName = (product.metadata?.slug as string)?.replace(
            "v1:product:tier:",
            "",
        ) as TierName;
        if (tierName) map[tierName] = product.id;
    }
    return map as TierProductMap;
}

export function createTierProductMapCached(
    kv: KVNamespace,
): (polar: Polar) => Promise<TierProductMap> {
    return cached(fetchTierProductMap, {
        log,
        ttl: TIER_CACHE_TTL,
        kv,
        keyGenerator: () => "tier:product:map",
    });
}
type ProductSlug = z.infer<typeof productParamSchema>;
const productParamSchema = z.enum(productSlugs.map(productSlugToUrlParam));

const checkoutParamsSchema = z.object({
    slug: productParamSchema,
});

const redirectQuerySchema = z.object({
    redirect: z
        .literal(["true", "false"])
        .transform((v) => v.toLowerCase().trim() === "true")
        .default(true),
});

export function productSlugToUrlParam(slug: string): string {
    return slug.split(":").join("-");
}

export function productUrlParamToSlug(slug: string): string {
    return slug.split("-").join(":");
}

async function getProductsBySlugs(polar: Polar) {
    const result = await polar.products.list({
        limit: 100,
        metadata: {
            slug: [...productSlugs],
        },
    });

    const productMap = Object.fromEntries(
        result.result.items.map((product) => [product.metadata.slug, product]),
    );

    return productMap;
}

export const polarRoutes = new Hono<Env>()
    .use("*", auth({ allowApiKey: false, allowSessionCookie: true }))
    .use("*", polar)
    .get(
        "/customer/state",
        describeRoute({
            tags: ["Auth"],
            description: "Get the polar customer state for the current user.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const result = await c.var.polar.getCustomerState(user.id);
            return c.json(result);
        },
    )
    .get(
        "/customer/events",
        describeRoute({
            tags: ["Auth"],
            description: "Get usage events associated with the current user.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const polar = c.var.polar.client;
            const result = await polar.events.list({
                externalCustomerId: user.id,
            });
            return c.json(result);
        },
    )
    .get(
        "/customer/pending-spend",
        describeRoute({
            tags: ["Auth"],
            description:
                "Get pending spend from recent events not yet processed by Polar.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const db = drizzle(c.env.DB);
            const PENDING_SPEND_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
            const windowStart = new Date(Date.now() - PENDING_SPEND_WINDOW_MS);
            const result = await db
                .select({
                    total: sql<number>`COALESCE(SUM(${event.totalPrice}), 0)`,
                })
                .from(event)
                .where(
                    and(
                        eq(event.userId, user.id),
                        eq(event.isBilledUsage, true),
                        gte(event.createdAt, windowStart),
                    ),
                );
            return c.json({ pendingSpend: result[0]?.total || 0 });
        },
    )
    .get(
        "/customer/portal",
        describeRoute({
            tags: ["Auth"],
            description: [
                "Redirects to the current users customer portal by default.",
                "If `redirect` is set to `false`, returns JSON with the redirect url.",
            ].join(" "),
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        validator("query", redirectQuerySchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const { redirect } = c.req.valid("query");
            try {
                const polar = c.var.polar.client;
                const result = await polar.customerSessions.create({
                    externalCustomerId: user.id,
                });
                if (redirect) return c.redirect(result.customerPortalUrl);
                return c.json({
                    redirect,
                    url: result.customerPortalUrl,
                });
            } catch (e) {
                throw new HTTPException(500, { cause: e });
            }
        },
    )
    .get(
        "/checkout/:slug",
        describeRoute({
            tags: ["Auth"],
            description:
                "Opens the polar checkout matching the product `slug`.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        validator("param", checkoutParamsSchema),
        validator("query", redirectQuerySchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const { slug: slugParam } = c.req.valid("param");
            const slug = productUrlParamToSlug(slugParam);
            const { redirect } = c.req.valid("query");
            try {
                const polar = c.var.polar.client;
                const packProducts = await getProductsBySlugs(polar);
                const response = await polar.checkouts.create({
                    externalCustomerId: user.id,
                    products: [packProducts[slug].id],
                    successUrl: c.env.POLAR_SUCCESS_URL,
                });
                if (redirect) return c.redirect(response.url);
                return c.json({
                    redirect,
                    url: response.url,
                });
            } catch (e) {
                throw new HTTPException(500, { cause: e });
            }
        },
    );

export type PolarRoutes = typeof polarRoutes;
