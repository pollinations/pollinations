import { validator } from "@shared/middleware/validator.ts";
import { errorResponseDescriptions } from "@shared/utils/api-docs.ts";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";
import { parseMediaOptions } from "../image/handler.ts";
import { quoteMediaRequest } from "../image/quote.ts";
import { getGenerationModelRegistry } from "../model-registry.ts";
import { GenerateImageRequestQueryParamsSchema } from "../schemas/image.ts";

const { resolution, quality } = GenerateImageRequestQueryParamsSchema.shape;
const request = z
    .strictObject({
        model: z.string().trim().min(1).describe("Public model ID or alias."),
        duration: z
            .int()
            .min(1)
            .max(120)
            .optional()
            .describe("Output duration in seconds."),
        resolution,
        quality,
        width: z.int().positive().optional(),
        height: z.int().positive().optional(),
        audio: z
            .boolean()
            .optional()
            .describe("Generate sound with the video."),
        image_count: z
            .int()
            .nonnegative()
            .default(0)
            .describe(
                "Number of inputs in the generation request's image field, including start/end frames.",
            ),
        reference_video_count: z
            .int()
            .nonnegative()
            .default(0)
            .describe("Number of clips in reference_videos."),
    })
    .meta({
        example: {
            model: "bytedance/seedance-2.0-mini",
            duration: 8,
            resolution: "480p",
        },
    });
const response = z.object({
    estimated_cost_usd: z.number().nonnegative().nullable(),
});

export const modelQuoteRoutes = new Hono<Env>().post(
    "/models/quote",
    describeRoute({
        tags: ["🤖 Models"],
        security: [],
        summary: "Estimate the cost of an image or video request",
        description:
            "Returns the listed USD estimate for the supplied settings without generating media or charging an account. A zero is a free quote. A null means the price cannot be determined in advance, or the public model is outside the image/video calculator. Actual charges follow billed usage. Send counts only for reference media.",
        responses: {
            200: {
                description: "Estimated cost",
                content: { "application/json": { schema: resolver(response) } },
            },
            ...errorResponseDescriptions(400, 404, 413, 429),
        },
    }),
    bodyLimit({
        maxSize: 8 * 1024,
        onError: () => {
            throw new HTTPException(413, {
                message: "Quote request is too large.",
            });
        },
    }),
    validator("json", request),
    async (c) => {
        const { model, image_count, reference_video_count, ...options } =
            c.req.valid("json");
        const entry = (await getGenerationModelRegistry(c.env)).resolve(model);
        if (!entry?.visible)
            throw new HTTPException(404, { message: "Model not found." });
        const { id, definition, communityEndpoint } = entry;
        if (
            definition.category !== "image" &&
            definition.category !== "video"
        ) {
            return c.json({ estimated_cost_usd: null });
        }
        if (
            image_count > 0 &&
            !communityEndpoint &&
            !definition.inputModalities?.includes("image")
        ) {
            throw new HTTPException(400, {
                message: "This model does not accept image inputs.",
            });
        }
        if (
            definition.maxReferenceImages !== undefined &&
            image_count > definition.maxReferenceImages
        ) {
            throw new HTTPException(400, {
                message: "Too many image inputs for this model.",
            });
        }
        if (
            reference_video_count > 0 &&
            !(communityEndpoint
                ? communityEndpoint.modality === "video"
                : definition.videoCapabilities?.includes("reference_videos"))
        ) {
            throw new HTTPException(400, {
                message: "This model does not accept reference videos.",
            });
        }
        if (
            definition.maxReferenceVideos !== undefined &&
            reference_video_count > definition.maxReferenceVideos
        ) {
            throw new HTTPException(400, {
                message: "Too many reference videos for this model.",
            });
        }
        const params = parseMediaOptions(options, {
            resolved: id,
            definition,
            communityEndpoint,
        });
        const cost = quoteMediaRequest(id, definition, {
            ...params,
            image: { length: image_count },
            reference_videos: { length: reference_video_count },
        });
        return c.json({ estimated_cost_usd: cost ?? null });
    },
);
