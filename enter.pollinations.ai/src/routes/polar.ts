import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import z from "zod";
import { auth } from "../middleware/auth.ts";
import { polar } from "../middleware/polar.ts";
import { validator } from "../middleware/validator.ts";
import type { Env } from "../env.ts";
import { describeRoute } from "hono-openapi";

export const productSlugs = [
    "v1:product:pack:5x2",
    "v1:product:pack:10x2",
    "v1:product:pack:20x2",
    "v1:product:pack:50x2",
] as const;
const productSlugSchema = z.enum(productSlugs);
type ProductSlug = z.infer<typeof productSlugSchema>;

const checkoutParamsSchema = z.object({
    slug: productSlugSchema,
});

const redirectQuerySchema = z.object({
    redirect: z
        .literal(["true", "false"])
        .transform((v) => v.toLowerCase().trim() === "true")
        .default(true),
});

type ProductMap = { [key in ProductSlug]: string };

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
            const { slug } = c.req.valid("param");
            const { redirect } = c.req.valid("query");
            const products: ProductMap = {
                "v1:product:pack:5x2": c.env.POLAR_PRODUCT_PACK_5X2,
                "v1:product:pack:10x2": c.env.POLAR_PRODUCT_PACK_10X2,
                "v1:product:pack:20x2": c.env.POLAR_PRODUCT_PACK_20X2,
                "v1:product:pack:50x2": c.env.POLAR_PRODUCT_PACK_50X2,
            };
            try {
                const polar = c.var.polar.client;
                const response = await polar.checkouts.create({
                    externalCustomerId: user.id,
                    products: [products[slug]],
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
