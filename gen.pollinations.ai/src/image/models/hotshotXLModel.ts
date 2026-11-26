import { UpstreamError } from "@shared/error.ts";
import { detectImageMimeType } from "@shared/image-mime.ts";
import { HOTSHOT_XL_GPU_SECOND_COST } from "@shared/registry/image.ts";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import type { ImageParams } from "../params.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import {
    runReplicatePrediction,
    toReplicateUpstreamError,
} from "../utils/replicateClient.ts";

export async function callHotshotXL(
    prompt: string,
    { width, height, seed }: ImageParams,
): Promise<ImageGenerationResult> {
    const input = { prompt, width, height, seed, mp4: false };
    try {
        const { output, predictTimeSeconds } = await runReplicatePrediction<
            typeof input,
            string
        >({
            model: "lucataco/hotshot-xl",
            version:
                "78b3a6257e16e4b241245d65c8b2b81ea2e1ff7ed4c55306b511509ddbfd327a",
            input,
        });
        if (!Number.isFinite(predictTimeSeconds) || predictTimeSeconds <= 0) {
            throw UpstreamError.fromProvider(502, {
                message: "Replicate Hotshot-XL returned no billable GPU time",
            });
        }
        const response = await fetchUpstream(output, {
            errorLabel: "Failed to download Hotshot-XL output",
        });
        const buffer = Buffer.from(await response.arrayBuffer());
        const mimeType = detectImageMimeType(buffer);
        if (mimeType !== "image/gif") {
            throw UpstreamError.fromProvider(502, {
                message: "Replicate Hotshot-XL returned an invalid GIF",
            });
        }
        return {
            buffer,
            mimeType,
            trackingData: {
                usage: {},
                providerBilling: {
                    units: predictTimeSeconds,
                    unitCost: HOTSHOT_XL_GPU_SECOND_COST,
                },
            },
        };
    } catch (error) {
        throw toReplicateUpstreamError(error, "Hotshot-XL generation failed");
    }
}
