type TransformOptions = {
    format?: "image/jpeg" | "image/png" | "image/webp";
    quality?: number;
    width?: number;
    height?: number;
    fit?: ImageTransform["fit"];
    maxWidth?: number;
    maxHeight?: number;
};

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

    let pipeline = imagesBinding.input(stream);
    if (width || height || maxWidth || maxHeight) {
        pipeline = pipeline.transform({
            width: width || maxWidth,
            height: height || maxHeight,
            fit,
        });
    }

    const response = (
        await pipeline.output({
            format,
            quality,
        })
    ).response();
    return Buffer.from(await response.arrayBuffer());
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

export async function resizeForGptImage(inputBuffer: Buffer): Promise<Buffer> {
    return transformImage(inputBuffer, {
        format: "image/jpeg",
        quality: 90,
        maxWidth: 1536,
        maxHeight: 1536,
    });
}
