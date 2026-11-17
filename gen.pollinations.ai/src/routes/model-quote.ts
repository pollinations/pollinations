import { validator } from "@shared/middleware/validator.ts";
import { errorResponseDescriptions } from "@shared/utils/api-docs.ts";
import { getModelStats } from "@shared/utils/model-stats.ts";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "@/env.ts";
import { resolveModelDefinition } from "@/middleware/model.ts";
import { edgeRateLimit } from "@/middleware/rate-limit-edge.ts";
import { GenerateImageRequestQueryParamsSchema } from "@/schemas/image.ts";
import { getEstimatedPrice } from "@/utils/model-stats.ts";
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
            "Price of one request in US dollars. Null when it cannot be calculated and the model has no 7-day average yet.",
    }),
    currency: z.literal("usd"),
    basis: z.enum(["listed", "average"]).optional().meta({
        description:
            "`listed`: calculated from the model's listed rates for these options. `average`: the median charge of this model's requests over the last 7 days, whatever their options. Absent when `price` is null.",
    }),
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
                "Why the price could not be calculated from the options.",
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
            "`basis` is `listed` when the price is calculated from the model's listed rates. Some charges are only known after generation: models billed per token, models billed from units the provider measures (megapixels, provider units), and requests whose cost depends on the reference media. Those answer with a `reason` and, as `basis: average`, the model's 7-day median charge from `/models/stats`; `price` is null until the model has one.",
            "",
            "A quote is an estimate, not the charge. Billing uses the usage the provider reports, which can differ, for example when a video comes back slightly longer than requested.",
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
        if (typeof quote === "number") {
            return c.json({
                model: model.resolved,
                price: quote,
                currency: "usd",
                basis: "listed",
            });
        }
        // Not calculable: answer with what this model's requests were charged.
        const average = getEstimatedPrice(
            await getModelStats(c.env.KV, c.var.log),
            model.resolved,
        );
        return c.json({
            model: model.resolved,
            price: average || null,
            currency: "usd",
            basis: average ? "average" : undefined,
            reason: quote,
            message: QUOTE_UNAVAILABLE_REASONS[quote],
        });
    },
);
