import { validator } from "@shared/middleware/validator.ts";
import { errorResponseDescriptions } from "@shared/utils/api-docs.ts";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "@/env.ts";
import { resolveModelDefinition } from "@/middleware/model.ts";
import { edgeRateLimit } from "@/middleware/rate-limit-edge.ts";
import { GenerateImageRequestQueryParamsSchema } from "@/schemas/image.ts";
import { parseImageParams } from "../image/handler.ts";
import {
    QUOTE_UNAVAILABLE_REASONS,
    type QuoteUnavailableReason,
    quoteMediaRequest,
} from "../image/quote.ts";

const QuoteQuerySchema = GenerateImageRequestQueryParamsSchema.extend({
    model: z.string().trim().min(1).meta({
        description:
            "Image or video model to quote, by canonical ID or alias. Required.",
        example: "google/veo-3.1-fast",
    }),
});

const QuoteResponseSchema = z.object({
    model: z.string().meta({ description: "Canonical model ID." }),
    price: z.number().nullable().meta({
        description:
            "Listed price of one request with these options, in US dollars. Null when it cannot be known before generation.",
    }),
    currency: z.literal("usd"),
    reason: z
        .enum(
            Object.keys(QUOTE_UNAVAILABLE_REASONS) as [
                QuoteUnavailableReason,
                ...QuoteUnavailableReason[],
            ],
        )
        .optional()
        .meta({
            description: [
                "Why `price` is null.",
                ...Object.entries(QUOTE_UNAVAILABLE_REASONS).map(
                    ([reason, message]) => `\`${reason}\`: ${message}`,
                ),
            ].join(" "),
        }),
    message: z.string().optional().meta({
        description: "The reason in words.",
    }),
});

export const modelQuoteRoutes = new Hono<Env>().get(
    "/models/quote",
    edgeRateLimit,
    describeRoute({
        tags: ["🤖 Models"],
        summary: "Price Quote",
        description: [
            "Returns what one image or video request costs with the chosen options, without generating anything. No authentication required.",
            "",
            "Pass `model` plus the same query parameters as `/image/{prompt}` or `/video/{prompt}`. The quote follows the options that change the price: `resolution`, `quality`, `duration`, `audio`, `width` and `height`, and whether `image` or `reference_videos` are present. Reference URLs are counted, never fetched. Invalid options return the same `400` as the generation request.",
            "",
            "`price` is null, with a `reason`, when the charge is only known after generation: models billed per token, models billed from units the provider measures (megapixels, provider units), and requests whose cost depends on the reference media.",
            "",
            "A quote is the listed price, not the charge. Billing uses the usage the provider reports, which can differ, for example when a video comes back slightly longer than requested.",
        ].join("\n"),
        responses: {
            200: {
                description: "Success",
                content: {
                    "application/json": {
                        schema: resolver(QuoteResponseSchema),
                    },
                },
            },
            ...errorResponseDescriptions(400, 500),
        },
    }),
    validator("query", QuoteQuerySchema),
    async (c) => {
        const requested = c.req.valid("query").model;
        if (requested.includes(",")) {
            throw new HTTPException(400, {
                message: "Quote one model at a time.",
            });
        }
        const model = await resolveModelDefinition(
            requested,
            "generate.image",
            c.env,
        );
        const { category } = model.definition;
        if (category !== "image" && category !== "video") {
            throw new HTTPException(400, {
                message: `Price quotes cover image and video models; "${model.resolved}" is a ${category} model.`,
            });
        }
        const quote = quoteMediaRequest(
            model.resolved,
            model.definition,
            parseImageParams(c, {}, model),
        );
        c.header("Cache-Control", "public, max-age=300");
        return c.json(
            typeof quote === "number"
                ? { model: model.resolved, price: quote, currency: "usd" }
                : {
                      model: model.resolved,
                      price: null,
                      currency: "usd",
                      reason: quote,
                      message: QUOTE_UNAVAILABLE_REASONS[quote],
                  },
        );
    },
);
