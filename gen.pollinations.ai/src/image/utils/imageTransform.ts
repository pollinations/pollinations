import { HttpError } from "../httpError.ts";

type TransformOptions = {
    format?: "image/jpeg" | "image/png" | "image/webp";
    quality?: number;
    width?: number;
    height?: number;
    fit?: ImageTransform["fit"];
    maxWidth?: number;
    maxHeight?: number;
};

// Synthetic URL used only to attribute Images binding failures in error telemetry.
const CLOUDFLARE_IMAGES_UPSTREAM_URL = "https://images.cloudflare.com/binding";

let imagesBinding: ImagesBinding | null = null;

export function setImagesBinding(binding: ImagesBinding | undefined): void {
    imagesBinding = binding || null;
}

export function getImagesBinding(): ImagesBinding | null {
    return imagesBinding;
}

export async function transformImage(
    inputBuffer: ArrayBuffer | Buffer,
    options: TransformOptions = {},
): Promise<Buffer> {
    if (!imagesBinding) {
        return inputBuffer instanceof ArrayBuffer
            ? Buffer.from(inputBuffer)
            : inputBuffer;
    }

    const {
        format = "image/jpeg",
        quality = 90,
        width,
        height,
        fit = "scale-down",
        maxWidth,
        maxHeight,
    } = options;
    const bytes =
        inputBuffer instanceof Buffer
            ? new Uint8Array(
                  inputBuffer.buffer.slice(
                      inputBuffer.byteOffset,
                      inputBuffer.byteOffset + inputBuffer.byteLength,
                  ),
              )
            : new Uint8Array(inputBuffer);

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(bytes);
            controller.close();
        },
    });

    let stage = "input";
    try {
        let pipeline = imagesBinding.input(stream);
        if (width || height || maxWidth || maxHeight) {
            pipeline = pipeline.transform({
                width: width || maxWidth,
                height: height || maxHeight,
                fit,
            });
        }

        stage = "output";
        const response = (
            await pipeline.output({
                format,
                quality,
            })
        ).response();
        stage = "body read";
        return Buffer.from(await response.arrayBuffer());
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new HttpError(
            `Cloudflare Images ${stage} failed: ${message}`,
            502,
            { service: "cloudflare-images", stage },
            CLOUDFLARE_IMAGES_UPSTREAM_URL,
        );
    }
}

export async function convertToJpeg(
    inputBuffer: Buffer,
    quality = 90,
): Promise<Buffer> {
    return transformImage(inputBuffer, {
        format: "image/jpeg",
        quality,
    });
}

export async function resizeForGptImage(
    inputBuffer: Buffer,
    maxDimension = 1536,
): Promise<Buffer> {
    return transformImage(inputBuffer, {
        format: "image/jpeg",
        quality: 90,
        maxWidth: maxDimension,
        maxHeight: maxDimension,
    });
}
