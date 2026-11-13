import { UpstreamError } from "@shared/error.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { FalError, runFalJobResponse } from "../../model3d/models/falClient.ts";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { sleep } from "../util.ts";
import { closestRatioLogSpace } from "../utils/aspectRatio.ts";
import { falBillableUnits, falUnitPrice } from "../utils/falBillableUnits.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";

const AZURE_MODEL = "lightricks/ltx-2.5-pro:azure";
const AZURE_DEPLOYMENT = "Fal-LTX-2.5-Pro";
const AZURE_BASE =
    "https://myceli-prod-img-2-eastus2.services.ai.azure.com/providers/falai/v1/lightricks/ltx-2.5";
type LtxResult = { video?: { url?: string; duration?: number } };

async function generateAzure(
    operation: string,
    input: Record<string, unknown>,
): Promise<LtxResult> {
    const key = getImageEnv("AZURE_MYCELI_PROD_IMG_2_EASTUS2_API_KEY");
    if (!key)
        throw UpstreamError.fromProvider(500, {
            message: "Azure LTX Pro is not configured",
        });
    const headers = { "api-key": key, "Content-Type": "application/json" };
    const submission = await fetchUpstream(`${AZURE_BASE}/${operation}/pro`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...input, model: AZURE_DEPLOYMENT }),
        errorLabel: "Azure LTX Pro submission failed",
    });
    const { request_id: id } = (await submission.json()) as {
        request_id?: string;
    };
    if (!id)
        throw UpstreamError.fromProvider(502, {
            message: "Azure LTX Pro returned no request ID",
        });
    const resultUrl = `${AZURE_BASE}/requests/${encodeURIComponent(id)}`;
    while (true) {
        const poll = await fetchUpstream(`${resultUrl}/status`, {
            headers,
            errorLabel: "Azure LTX Pro status check failed",
        });
        const { status } = (await poll.json()) as { status?: string };
        if (status === "COMPLETED") break;
        if (status !== "IN_PROGRESS" && status !== "IN_QUEUE") {
            throw UpstreamError.fromProvider(502, {
                message: "Azure LTX Pro did not complete",
            });
        }
        await sleep(3000);
    }
    const result = await fetchUpstream(resultUrl, {
        headers,
        errorLabel: "Azure LTX Pro result fetch failed",
    });
    return (await result.json()) as LtxResult;
}

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
        result = await generateAzure(operation, input);
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
    const video = await fetchUpstream(result.video.url, {
        ...(URL.parse(result.video.url)?.origin === new URL(AZURE_BASE).origin
            ? {
                  headers: {
                      "api-key":
                          getImageEnv(
                              "AZURE_MYCELI_PROD_IMG_2_EASTUS2_API_KEY",
                          ) ?? "",
                  },
                  redirect: "error" as const,
              }
            : {}),
        errorLabel: "Failed to download LTX Pro video",
    });
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
