import { Hono, Context } from "hono";
import { HTTPException } from "hono/http-exception";
import z from "zod";
import { authenticate } from "../middleware/authenticate.ts";
import { polar } from "../middleware/polar.ts";
import { validator } from "../middleware/validator.ts";
import type { Env } from "../env.ts";
import { describeRoute } from "hono-openapi";

const productSlugSchema = z.literal([
    "pollen-bundle-small",
    "pollen-bundle-medium",
    "pollen-bundle-large",
]);
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
const products: ProductMap = {
    "pollen-bundle-small": "c2c433fd-ce3f-44b3-b766-feb3c263b4ff",
    "pollen-bundle-medium": "70aa83ca-1f21-420a-bb10-348c35f338e9",
    "pollen-bundle-large": "2258fb2c-113b-4502-bdce-1eba6e5eb931",
};

export const polarRoutes = new Hono<Env>()
    .use("*", authenticate)
    .use("*", polar)
    .get(
        "/customer/state",
        describeRoute({
            description: "Get the polar customer state for the current user.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        async (c) => {
            const { user } = c.var.auth.requireActiveSession();
            const polar = c.var.polar.client;
            const result = await polar.customers.getStateExternal({
                externalId: user.id,
            });
            return c.json(result);
        },
    )
    .get(
        "/customer/events",
        describeRoute({
            description: "Get usage events associated with the current user.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        async (c) => {
            const { user } = c.var.auth.requireActiveSession();
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
            description: [
                "Redirects to the current users customer portal by default.",
                "If `redirect` is set to `false`, returns JSON with the redirect url.",
            ].join(" "),
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        validator("query", redirectQuerySchema),
        async (c) => {
            const { user } = c.var.auth.requireActiveSession();
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
            description:
                "Opens the polar checkout matching the product `slug`.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        validator("param", checkoutParamsSchema),
        validator("query", redirectQuerySchema),
        async (c) => {
            const { user } = c.var.auth.requireActiveSession();
            const { slug } = c.req.valid("param");
            const { redirect } = c.req.valid("query");
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
