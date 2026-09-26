import { UpstreamError } from "@shared/error.ts";
import { IMMUTABLE_CACHE_CONTROL } from "@shared/http/cache-control.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { buildUsageHeaders } from "@shared/registry/usage-headers.ts";
import { readResponseBytes } from "@shared/response-bytes.ts";
import { validateUserMediaUrl } from "@shared/user-media-url.ts";
import type { Context } from "hono";
import { z } from "zod";
import type { Env } from "../env.ts";
import { withModelFallbackResponse } from "../fallback.ts";
import { syncImageEnv } from "../image/env.ts";
import { fetchUpstream } from "../image/utils/fetchUpstream.ts";
import {
    runReplicatePrediction,
    toReplicateUpstreamError,
} from "../image/utils/replicateClient.ts";
import { applySafetyToInput, withSafetyHeaders } from "../middleware/safety.ts";
import { enforceModelRateLimit } from "../utils/model-rate-limit.ts";
import { mp4TrackDurations } from "./mp4.ts";

export const MMAUDIO_VERSION =
    "62871fb59889b2d7c13777f08deb3b36bdff88f7e1d53a50ad7694548a41b484";

const { minDuration, maxDuration, defaultDuration } =
    IMAGE_SERVICES["sony/mmaudio-v2"];

export const VideoAudioRequestSchema = z
    .object({
        model: z.string().default("sony/mmaudio-v2"),
        video_url: z
            .string()
            .refine(
                (url) => validateUserMediaUrl(url).ok,
                "Expected a public HTTP(S) video URL",
            ),
        prompt: z.string().min(1).max(10000),
        duration: z
            .number()
            .min(minDuration)
            .max(maxDuration)
            .default(defaultDuration),
        negative_prompt: z.string().max(10000).default(""),
        seed: z.number().int().min(0).max(2147483647).optional(),
    })
    .strict()
    .meta({ $id: "VideoAudioRequest" });

export async function generateVideoAudio(c: Context<Env>): Promise<Response> {
    const {
        video_url,
        model: _model,
        ...params
    } = c.req.valid("json" as never) as z.infer<typeof VideoAudioRequestSchema>;
    syncImageEnv(c.env, ["REPLICATE_API_TOKEN"]);
    const prompt = await applySafetyToInput(c, params.prompt);
    const input = { ...params, prompt, num_steps: 25, cfg_strength: 4.5 };
    return withModelFallbackResponse(
        c.var.model,
        async (candidate) => {
            let url: string;
            let computeSeconds: number;
            try {
                const result = await runReplicatePrediction<
                    Record<string, unknown>,
                    string
                >({
                    model: "zsxkib/mmaudio",
                    version: MMAUDIO_VERSION,
                    input: { ...input, video: video_url },
                });
                url = result.output;
                computeSeconds = result.predictTimeSeconds;
            } catch (error) {
                throw toReplicateUpstreamError(
                    error,
                    "MMAudio generation failed",
                );
            }
            if (!Number.isFinite(computeSeconds) || computeSeconds <= 0) {
                throw UpstreamError.fromProvider(502, {
                    message: "Replicate response has no compute usage",
                });
            }
            if (typeof url !== "string" || !validateUserMediaUrl(url).ok) {
                throw UpstreamError.fromProvider(502, {
                    message: "MMAudio response has no valid output URL",
                });
            }
            const media = await fetchUpstream(url);
            const bytes = await readResponseBytes(media, 64 * 1024 * 1024, () =>
                UpstreamError.fromProvider(502, {
                    message: "MMAudio output exceeds the 64 MB response limit",
                }),
            );
            let durations: ReturnType<typeof mp4TrackDurations>;
            try {
                durations = mp4TrackDurations(bytes);
            } catch (cause) {
                throw UpstreamError.fromProvider(502, {
                    message:
                        "MMAudio returned an invalid video or missing soundtrack",
                    cause,
                });
            }
            // The customer pays Replicate's reported GPU time.
            c.var.track.setPricingInput({ computeSeconds });
            return withSafetyHeaders(
                c,
                new Response(bytes, {
                    headers: {
                        "Content-Type": "video/mp4",
                        "Content-Disposition":
                            'inline; filename="soundtrack.mp4"',
                        "Cache-Control": IMMUTABLE_CACHE_CONTROL,
                        ...buildUsageHeaders(candidate.id, {
                            completionVideoSeconds: durations.video,
                        }),
                    },
                }),
            );
        },
        c.var.track.attempts,
        (candidate) => enforceModelRateLimit(c, candidate),
    );
}
