type TransformOptions = {
    format?: "image/jpeg" | "image/png" | "image/webp";
    quality?: number;
    width?: number;
    height?: number;
    fit?: ImageTransform["fit"];
    maxWidth?: number;
    maxHeight?: number;
    forceBaseline?: boolean; // ✅ НОВЫЙ ПАРАМЕТР
};

let imagesBinding: ImagesBinding | null = null;

export function setImagesBinding(binding: ImagesBinding | undefined): void {
    imagesBinding = binding || null;
}

export function getImagesBinding(): ImagesBinding | null {
    return imagesBinding;
}

/**
 * Проверяет, является ли JPEG прогрессивным
 * По маркеру SOF2 (FF C2) в заголовке JPEG
 */
export function isProgressiveJpeg(buffer: Buffer): boolean {
    // JPEG начинается с FF D8
    if (buffer.length < 10 || buffer[0] !== 0xFF || buffer[1] !== 0xD8) {
        return false;
    }
    
    // Ищем маркер SOF (Start of Frame)
    let offset = 2; // Пропускаем SOI (Start of Image)
    
    while (offset + 9 < buffer.length) {
        // Ищем маркер FF
        if (buffer[offset] !== 0xFF) {
            offset++;
            continue;
        }
        
        const marker = buffer[offset + 1];
        
        // SOF0 = Baseline (FF C0)
        // SOF2 = Progressive (FF C2)
        if (marker === 0xC0 || marker === 0xC2) {
            return marker === 0xC2;
        }
        
        // Пропускаем остальные маркеры
        const segmentLength = buffer.readUInt16BE(offset + 2);
        offset += 2 + segmentLength;
    }
    
    return false; // По умолчанию считаем baseline
}

/**
 * Проверяет, является ли изображение JPEG (по сигнатуре)
 */
export function isJpeg(buffer: Buffer): boolean {
    return buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xD8;
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
        forceBaseline = false, // ✅ НОВЫЙ ПАРАМЕТР
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

    // ✅ Добавляем progressive: false для принудительного baseline
    const outputOptions: any = {
        format,
        quality,
    };
    
    // Cloudflare Images Binding: progressive: false = baseline
    if (format === "image/jpeg" && forceBaseline) {
        outputOptions.progressive = false;
    }

    const response = (
        await pipeline.output(outputOptions)
    ).response();
    return Buffer.from(await response.arrayBuffer());
}

/**
 * Конвертирует изображение в базовый JPEG (baseline)
 * Если изображение уже baseline - возвращает как есть (экономия ресурсов)
 */
export async function ensureBaselineJpeg(
    inputBuffer: Buffer,
    quality = 90,
): Promise<Buffer> {
    // Если не JPEG или уже baseline - возвращаем как есть
    if (!isJpeg(inputBuffer) || !isProgressiveJpeg(inputBuffer)) {
        return inputBuffer;
    }
    
    // Конвертируем прогрессивный JPEG в baseline
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
        forceBaseline: true, // ✅ Всегда baseline
    });
}

export async function resizeForGptImage(inputBuffer: Buffer): Promise<Buffer> {
    return transformImage(inputBuffer, {
        format: "image/jpeg",
        quality: 90,
        maxWidth: 1536,
        maxHeight: 1536,
        forceBaseline: true, // ✅ Всегда baseline
    });
}
