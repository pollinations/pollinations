import { UpstreamError } from "@shared/error.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { FalError, runFalJobResponse } from "../../model3d/models/falClient.ts";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { closestRatioLogSpace } from "../utils/aspectRatio.ts";
import { fetchFalVideo, runAzureFalVideo } from "../utils/azureFalVideo.ts";
import { falBillableUnits, falUnitPrice } from "../utils/falBillableUnits.ts";

const AZURE_MODEL = "lightricks/ltx-2.5-pro:azure";
type LtxResult = { video?: { url?: string; duration?: number } };

export async function callLtxVideo(
    prompt: string,
    params: ImageParams,
): Promise<VideoGenerationResult> {
    const [start, end] = params.image;
    const duration = params.duration ?? 6;
    const resolution = params.resolution ?? "720p";
    const fps = params.fps ?? 25;
    const aspectRatio =
        params.aspectRatio ??
        closestRatioLogSpace(params.width, params.height, ["16:9", "9:16"]);
    if (
        !["16:9", "9:16"].includes(aspectRatio) ||
        ![24, 25, 50].includes(fps)
    ) {
        throw new UpstreamError(400, {
            message: "LTX 2.5 Pro supports 16:9 or 9:16 at 24, 25, or 50 FPS.",
        });
    }
    const input = {
        prompt,
        duration,
        resolution,
        fps,
        aspect_ratio: aspectRatio,
        generate_audio: params.audio ?? true,
        image_url: start,
        end_image_url: end,
    };
    const operation = start ? "image-to-video" : "text-to-video";
    let result: LtxResult;
    let seconds = duration;
    let providerBilling: { units: number; unitCost: number } | undefined;
    if (params.model === AZURE_MODEL) {
        // Azure bills the requested duration. The tested six-second meter
        // reported six units and the queue response carried no billing header.
        const response = await runAzureFalVideo(
            "Fal-LTX-2.5-Pro",
            "lightricks/ltx-2.5",
            `${operation}/pro`,
            input,
        );
        result = (await response.json()) as LtxResult;
    } else {
        const apiKey = getImageEnv("FAL_KEY");
        if (!apiKey)
            throw UpstreamError.fromProvider(500, {
                message: "FAL_KEY is not configured",
            });
        const endpoint = `lightricks/ltx-2.5/${operation}/pro`;
        const unitCost = await falUnitPrice(endpoint, apiKey);
        try {
            const response = await runFalJobResponse(
                { endpoint, input },
                apiKey,
            );
            const units = falBillableUnits(response);
            const model = IMAGE_SERVICES["lightricks/ltx-2.5-pro"];
            const rate =
                resolution === "1080p"
                    ? model.costVariants?.["1080p"]?.completionVideoSeconds
                    : model.cost.completionVideoSeconds;
            if (!rate) throw new Error("Missing LTX Pro rate");
            seconds = (units * unitCost) / rate;
            providerBilling = { units, unitCost };
            result = (await response.json()) as LtxResult;
        } catch (error) {
            if (!(error instanceof FalError)) throw error;
            throw UpstreamError.fromProvider(error.status ?? 502, {
                message: error.message,
                responseBody: error.responseBody,
            });
        }
    }
    if (!result.video?.url)
        throw UpstreamError.fromProvider(502, {
            message: "LTX Pro returned no video",
        });
    const video = await fetchFalVideo(
        result.video.url,
        "Failed to download LTX Pro video",
    );
    return {
        buffer: Buffer.from(await video.arrayBuffer()),
        mimeType: "video/mp4",
        durationSeconds: seconds,
        trackingData: {
            actualModel: params.model,
            usage: { completionVideoSeconds: seconds },
            providerBilling,
        },
    };
}
