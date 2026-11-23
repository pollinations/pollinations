import { validator } from "@shared/middleware/validator.ts";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import type { Env } from "@/env.ts";
import { parseImageParams } from "@/image/handler.ts";
import { quoteMediaRequest } from "@/image/quote.ts";
import { resolveModel } from "@/middleware/model.ts";
import { GenerateImageRequestQueryParamsSchema } from "@/schemas/image.ts";

// Prices are public on /models, so the quote needs no key. It only runs the
// options through the billing rates; nothing is generated or charged.
export const quoteRoutes = new Hono<Env>().get(
    "/quote",
    describeRoute({
        tags: ["🤖 Models"],
        security: [],
        summary: "Quote Image or Video Price",
        description: [
            "Listed price in US dollars of one image or video request with these options, before running it. Takes the same query parameters as `/image/{prompt}` and `/video/{prompt}`.",
            "",
            "`price_usd` is `null` when the price is known only after generation: token-priced and per-megapixel models, and lengths set by a reference video. The charge follows the usage the provider reports, so it can differ from the quote.",
        ].join("\n"),
        responses: {
            200: { description: "`{ model, price_usd }`" },
            400: { description: "Unknown model or invalid options" },
        },
    }),
    validator("query", GenerateImageRequestQueryParamsSchema),
    resolveModel("generate.image"),
    (c) => {
        const { resolved, definition } = c.var.model;
        const price = quoteMediaRequest(
            resolved,
            definition,
            parseImageParams(c, {}),
        );
        c.header("Cache-Control", "public, max-age=300");
        return c.json({ model: resolved, price_usd: price ?? null });
    },
);
