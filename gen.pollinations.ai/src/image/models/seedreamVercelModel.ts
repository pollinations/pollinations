import { UpstreamError } from "@shared/error.ts";
import { createGateway } from "ai";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import {
    base64ToBuffer,
    downloadUserImage,
    readImageDimensions,
} from "../utils/imageDownload.ts";
import {
    resolveSeedreamAspectRatio,
    resolveSeedreamGatewayRatio,
} from "./seedreamReplicateModel.ts";

export async function callSeedreamVercelAPI(
    prompt: string,
    params: ImageParams,
): Promise<ImageGenerationResult> {
    const is55 = params.model === "bytedance-seed/seedream-5-5";
    const images = await Promise.all(
        params.image.map((url) => downloadUserImage(url)),
    );
    const ratio = is55
        ? resolveSeedreamGatewayRatio(params, true)
        : resolveSeedreamAspectRatio(params, images.length > 0);
    let [width, height] = ratio.split(":").map(Number);
    if (ratio === "match_input_image" || ratio === "auto") {
        const first = images[0];
        const dimensions = first
            ? readImageDimensions(first.buffer, first.mimeType)
            : { width: 1, height: 1 };
        if (!dimensions) {
            // Replicate can inspect formats whose dimensions our decoder cannot read.
            throw UpstreamError.fromProvider(502, {
                message: "Cannot preserve reference aspect ratio on Vercel",
            });
        }
        ({ width, height } = dimensions);
    }
    // ByteDance ignores the SDK aspectRatio option, so send explicit dimensions.
    const pixels = is55
        ? params.resolution === "2k"
            ? 2048 ** 2
            : 1024 ** 2
        : 4_000_000;
    const scale = Math.sqrt(pixels / (width * height));
    const size =
        `${Math.round((width * scale) / 16) * 16}x${Math.round((height * scale) / 16) * 16}` as const;
    const gateway = createGateway({
        apiKey: getImageEnv("AI_GATEWAY_API_KEY"),
    });
    const result = await Promise.resolve(
        gateway
            .image(
                is55 ? "bytedance/seedream-5.5" : "bytedance/seedream-5.0-pro",
            )
            .doGenerate({
                prompt,
                n: 1,
                size,
                aspectRatio: undefined,
                seed: is55 ? params.seed : undefined,
                files: images.map(({ buffer, mimeType }) => ({
                    type: "file",
                    data: buffer,
                    mediaType: mimeType,
                })),
                mask: undefined,
                providerOptions: {
                    gateway: { only: ["bytedance"] },
                    bytedance: { watermark: false },
                },
            }),
    ).catch((error: { statusCode?: number; message: string }) => {
        throw UpstreamError.fromProvider(error.statusCode ?? 502, {
            message: `Seedream Vercel generation failed: ${error.message}`,
        });
    });
    const reportedCost = (
        result.providerMetadata?.gateway as { cost?: unknown } | undefined
    )?.cost;
    const cost =
        typeof reportedCost === "string" && reportedCost.trim()
            ? Number(reportedCost)
            : reportedCost;
    if (
        typeof cost !== "number" ||
        !Number.isFinite(cost) ||
        cost < 0 ||
        !result.images[0]
    ) {
        throw UpstreamError.fromProvider(502, {
            message:
                "Seedream Vercel response is missing image or valid billed cost",
        });
    }
    const image = result.images[0];
    return {
        buffer:
            typeof image === "string"
                ? base64ToBuffer(image)
                : Buffer.from(image),
        trackingData: {
            actualModel: params.model,
            usage: {
                ...(is55 &&
                    images.length > 0 && { promptImageTokens: images.length }),
                completionImageTokens: 1,
                totalTokenCount: 1 + (is55 ? images.length : 0),
            },
            providerBilling: { units: cost, unitCost: 1 },
        },
    };
}
