import { UpstreamError } from "@shared/error.ts";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import type { ImageParams } from "../params.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import {
    runReplicatePrediction,
    toReplicateUpstreamError,
} from "../utils/replicateClient.ts";
import {
    resolveGrokAspectRatio,
    resolveGrokDuration,
} from "./openRouterVideoModel.ts";

export async function callGrokReplicateVideoAPI(
    prompt: string,
    params: ImageParams,
): Promise<VideoGenerationResult> {
    const input = {
        prompt,
        duration: resolveGrokDuration(params.duration),
        resolution: "720p",
        aspect_ratio: resolveGrokAspectRatio(params),
        ...(params.seed === undefined ? {} : { seed: params.seed }),
        ...(params.image[0] ? { image: params.image[0] } : {}),
    };
    try {
        const result = await runReplicatePrediction<typeof input, string>({
            model: "xai/grok-imagine-video",
            input,
            // Replicate's documented platform prediction limit.
            predictionDeadlineMinutes: 30,
        });
        const seconds = result.videoOutputDurationSeconds;
        if (
            typeof seconds !== "number" ||
            !Number.isFinite(seconds) ||
            seconds <= 0
        ) {
            throw UpstreamError.fromProvider(502, {
                message:
                    "Replicate Grok response is missing output video duration",
            });
        }
        const response = await fetchUpstream(result.output, {
            errorLabel: "Failed to download Grok video",
        });
        return {
            buffer: Buffer.from(await response.arrayBuffer()),
            mimeType: "video/mp4",
            durationSeconds: seconds,
            trackingData: {
                actualModel: params.model,
                usage: {
                    ...(params.image[0] ? { promptImageTokens: 1 } : {}),
                    completionVideoSeconds: seconds,
                },
            },
        };
    } catch (error) {
        throw toReplicateUpstreamError(error, "Grok video generation failed");
    }
}
