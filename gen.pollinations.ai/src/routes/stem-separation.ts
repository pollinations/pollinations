import {
    errorResponseDescriptions,
    mediaResponseHeaders,
} from "@shared/utils/api-docs.ts";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import {
    handleStemSeparation,
    STEM_VARIATIONS,
} from "../audio/stem-separation.ts";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import { balance } from "../middleware/balance.ts";
import { prepareGenerationRequest } from "../middleware/generation-cache.ts";
import { deduplicateGeneration } from "../middleware/generation-deduplication.ts";
import { audioCache } from "../middleware/media-cache.ts";
import { resolveModel } from "../middleware/model.ts";
import { frontendKeyRateLimit } from "../middleware/rate-limit-durable.ts";
import { edgeRateLimit } from "../middleware/rate-limit-edge.ts";
import { track } from "../middleware/track.ts";
import {
    apiKeyBudgetReservation,
    generationAccess,
} from "../utils/generation-access.ts";

export const stemSeparationRoutes = new Hono<Env>()
    .use("/audio/stem-separation", edgeRateLimit)
    .use("/audio/stem-separation", auth(), frontendKeyRateLimit, balance)
    .post(
        "/audio/stem-separation",
        describeRoute({
            tags: ["🔊 Audio"],
            summary: "Separate Audio Stems",
            description:
                "Separate an uploaded audio file into vocals and instrumental, or vocals, drums, bass, guitar, piano, and other. Returns a ZIP of stereo 44.1 kHz MP3 files at 128 kbps. Pricing uses input duration and the selected stem variation; see /audio/models. This native endpoint has no OpenAI-compatible equivalent.",
            requestBody: {
                required: true,
                content: {
                    "multipart/form-data": {
                        schema: {
                            type: "object",
                            required: ["file"],
                            properties: {
                                model: {
                                    type: "string",
                                    default: "elevenlabs/stem-separation",
                                },
                                file: {
                                    type: "string",
                                    format: "binary",
                                    description:
                                        "Source audio, up to 50 MB, with a readable duration.",
                                },
                                stem_variation_id: {
                                    type: "string",
                                    enum: [...STEM_VARIATIONS],
                                    default: "six_stems_v1",
                                },
                            },
                        },
                    },
                },
            },
            responses: {
                200: {
                    description: "ZIP containing the separated MP3 tracks",
                    headers: mediaResponseHeaders,
                    content: {
                        "application/zip": {
                            schema: { type: "string", format: "binary" },
                        },
                    },
                },
                ...errorResponseDescriptions(400, 401, 402, 403, 413, 500, 502),
            },
        }),
        resolveModel("generate.audio", {
            defaultModel: "elevenlabs/stem-separation",
            supportedEndpoint: "/audio/stem-separation",
        }),
        track("generate.audio"),
        prepareGenerationRequest,
        audioCache,
        generationAccess,
        deduplicateGeneration,
        apiKeyBudgetReservation,
        handleStemSeparation,
    );
