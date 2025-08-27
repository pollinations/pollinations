import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import z from "zod";
import { auth } from "../middleware/auth.ts";
import { polar } from "../middleware/polar.ts";
import { validator } from "../validator.ts";

type Env = {
    Bindings: CloudflareBindings;
};

const productSlugSchema = z.literal([
    "pollen-bundle-small",
    "pollen-bundle-medium",
    "pollen-bundle-large",
]);
type ProductSlug = z.infer<typeof productSlugSchema>;

type ProductMap = { [key in ProductSlug]: string };
const products: ProductMap = {
    "pollen-bundle-small": "xxx",
    "pollen-bundle-medium": "816c4274-d2ec-4b79-b013-6d89cada85d2",
    "pollen-bundle-large": "xxx",
};

export const polarRoutes = new Hono<Env>()
    .use("*", auth)
    .use("*", polar)
    .get("/customer/state", async (c) => {
        const user = c.get("user");
        if (!user) return c.json({ message: "Unauthorized" }, 401);
        const polar = c.get("polar");
        const result = await polar.customers.getStateExternal({
            externalId: user.id,
        });
        return c.json(result);
    })
    .get(
        "/checkout/:slug",
        validator("param", z.object({ slug: productSlugSchema })),
        async (c) => {
            const user = c.get("user");
            if (!user) return c.json({ message: "Unauthorized" }, 401);
            const polar = c.get("polar");
            const { slug } = c.req.valid("param");
            try {
                const response = await polar.checkouts.create({
                    externalCustomerId: user.id,
                    products: [products[slug]],
                });
                return c.redirect(response.url);
            } catch (e) {
                throw new HTTPException(500, { cause: e });
            }
        },
    );

export type PolarRoutes = typeof polarRoutes;
