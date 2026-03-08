/**
 * Image transformation using Cloudflare Images binding.
 * Replaces sharp for JPEG conversion and resizing in Workers.
 */

// Module-level binding reference, set once per request via setImagesBinding().
let _imagesBinding: any = null;

/** Store the IMAGES binding for use by functions that can't receive it directly. */
export function setImagesBinding(binding: any): void {
  _imagesBinding = binding;
}

/** Retrieve the stored IMAGES binding. */
export function getImagesBinding(): any {
  return _imagesBinding;
}

interface TransformOptions {
  format?: "image/jpeg" | "image/png" | "image/webp";
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
}

/**
 * Convert/resize an image buffer using Cloudflare Images binding.
 * Falls back to returning the original buffer if IMAGES binding is unavailable.
 */
export async function transformImage(
  imagesBinding: any,
  inputBuffer: ArrayBuffer | Buffer,
  options: TransformOptions = {},
): Promise<Buffer> {
  const {
    format = "image/jpeg",
    quality = 90,
    maxWidth,
    maxHeight,
  } = options;

  // Fallback if binding not configured
  if (!imagesBinding) {
    return Buffer.from(inputBuffer);
  }

  const bytes =
    inputBuffer instanceof Buffer
      ? new Uint8Array(
          inputBuffer.buffer.slice(
            inputBuffer.byteOffset,
            inputBuffer.byteOffset + inputBuffer.byteLength,
          ),
        )
      : new Uint8Array(inputBuffer);

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });

  let pipeline = imagesBinding.input(stream);

  if (maxWidth || maxHeight) {
    pipeline = pipeline.transform({
      width: maxWidth,
      height: maxHeight,
      fit: "scale-down",
    });
  }

  const response = (await pipeline.output({ format, quality })).response();

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Convert image to JPEG format.
 */
export async function convertToJpeg(
  imagesBinding: any,
  inputBuffer: Buffer,
  quality = 90,
): Promise<Buffer> {
  return transformImage(imagesBinding, inputBuffer, {
    format: "image/jpeg",
    quality,
  });
}

/**
 * Resize image for GPT Image input (max ~2.36MP) and convert to JPEG.
 */
export async function resizeForGptImage(
  imagesBinding: any,
  inputBuffer: Buffer,
): Promise<Buffer> {
  return transformImage(imagesBinding, inputBuffer, {
    format: "image/jpeg",
    quality: 90,
    maxWidth: 1536,
    maxHeight: 1536,
  });
}
