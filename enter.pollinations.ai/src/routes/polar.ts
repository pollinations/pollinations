import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute } from "hono-openapi";
import z from "zod";
import { user as userTable } from "@/db/schema/better-auth.ts";
import {
    getPackProductMapCached,
    type PackProductSlug,
    packProductSlugs,
} from "@/utils/polar.ts";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import { polar } from "../middleware/polar.ts";
import { validator } from "../middleware/validator.ts";

const productParamSchema = z.enum(packProductSlugs.map(productSlugToUrlParam));

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

export const polarRoutes = new Hono<Env>()
    .use("*", auth({ allowApiKey: false, allowSessionCookie: true }))
    .use("*", polar)
    .get(
        "/customer/d1-balance",
        describeRoute({
            tags: ["Auth"],
            description:
                "Get the local D1 pollen balance for the current user.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const { tierBalance, packBalance, cryptoBalance } =
                await c.var.polar.getBalance(user.id);
            const db = drizzle(c.env.DB);
            const users = await db
                .select({ lastTierGrant: userTable.lastTierGrant })
                .from(userTable)
                .where(eq(userTable.id, user.id))
                .limit(1);
            const lastTierGrant = users[0]?.lastTierGrant ?? null;

            return c.json({
                tierBalance,
                packBalance,
                cryptoBalance,
                lastTierGrant,
            });
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
            // Polar checkout temporarily disabled - using Stripe instead
            // To re-enable: remove this throw statement and the biome-ignore below
            throw new HTTPException(503, {
                message:
                    "This payment method is temporarily unavailable. Please use the main checkout.",
            });

            // biome-ignore lint/correctness/noUnreachable: Intentionally kept as warm fallback
            const user = c.var.auth.requireUser();
            const { slug: slugParam } = c.req.valid("param");
            const slug = productUrlParamToSlug(slugParam);
            const { redirect } = c.req.valid("query");
            try {
                const polar = c.var.polar.client;
                const packProducts = await getPackProductMapCached(
                    polar,
                    c.env.KV,
                );
                const response = await polar.checkouts.create({
                    externalCustomerId: user.id,
                    products: [packProducts[slug as PackProductSlug].id],
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
