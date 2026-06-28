type TransformOptions = {
    format?: "image/jpeg" | "image/png" | "image/webp";
    quality?: number;
    width?: number;
    height?: number;
    fit?: ImageTransform["fit"];
    maxWidth?: number;
    maxHeight?: number;
    forceBaseline?: boolean;
};

let imagesBinding: ImagesBinding | null = null;

export function setImagesBinding(binding: ImagesBinding | undefined): void {
    imagesBinding = binding || null;
}

export function getImagesBinding(): ImagesBinding | null {
    return imagesBinding;
}

/**
 * Check if a JPEG buffer is progressive by scanning for SOF2 marker (FF C2).
 * Returns false for baseline JPEG (SOF0 / FF C0) or non-JPEG data.
 */
export function isProgressiveJpeg(buffer: Buffer): boolean {
    if (buffer.length < 10 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
        return false;
    }

    let offset = 2;

    while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) {
            offset++;
            continue;
        }

        const marker = buffer[offset + 1];

        if (marker === 0xc0 || marker === 0xc2) {
            return marker === 0xc2;
        }

        const segmentLength = buffer.readUInt16BE(offset + 2);
        offset += 2 + segmentLength;
    }

    return false;
}

/**
 * Check whether a buffer starts with the JPEG magic bytes (FF D8).
 */
export function isJpeg(buffer: Buffer): boolean {
    return buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8;
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
        forceBaseline = false,
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

    const outputOptions: ImageOutputOptions & Record<string, unknown> = {
        format,
        quality,
    };

    if (format === "image/jpeg" && forceBaseline) {
        outputOptions.progressive = false;
    }

    const response = (await pipeline.output(outputOptions)).response();
    return Buffer.from(await response.arrayBuffer());
}

/**
 * Convert a progressive JPEG to baseline by re-encoding.
 * Returns the input unchanged if already baseline or not JPEG.
 */
export async function ensureBaselineJpeg(
    inputBuffer: Buffer,
    quality = 90,
): Promise<Buffer> {
    if (!isJpeg(inputBuffer) || !isProgressiveJpeg(inputBuffer)) {
        return inputBuffer;
    }

    return transformImage(inputBuffer, {
        format: "image/jpeg",
        quality,
        forceBaseline: true,
    });
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
