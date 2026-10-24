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
import { resolveSeedreamAspectRatio } from "./seedreamReplicateModel.ts";

export async function callSeedream5ProVercelAPI(
    prompt: string,
    params: ImageParams,
): Promise<ImageGenerationResult> {
    const images = await Promise.all(
        params.image.map((url) => downloadUserImage(url)),
    );
    const ratio = resolveSeedreamAspectRatio(params, images.length > 0);
    let [width, height] = ratio.split(":").map(Number);
    if (ratio === "match_input_image") {
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
    // Replicate's 2K contract is 4 megapixels rounded to 16-pixel steps.
    // ByteDance ignores the SDK aspectRatio option, so send explicit dimensions.
    const scale = Math.sqrt(4_000_000 / (width * height));
    const size =
        `${Math.round((width * scale) / 16) * 16}x${Math.round((height * scale) / 16) * 16}` as const;
    const gateway = createGateway({
        apiKey: getImageEnv("AI_GATEWAY_API_KEY"),
    });
    const result = await Promise.resolve(
        gateway.image("bytedance/seedream-5.0-pro").doGenerate({
            prompt,
            n: 1,
            size,
            aspectRatio: undefined,
            seed: undefined,
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
            usage: { completionImageTokens: 1, totalTokenCount: 1 },
            providerBilling: { units: cost, unitCost: 1 },
        },
    };
}
