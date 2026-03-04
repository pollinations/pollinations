import debug from "debug";

const logPerf = debug("pollinations:perf");

interface SafeParams {
    model: string;
}

/**
 * Writes EXIF metadata to the image buffer.
 * Workers-compatible: returns buffer unchanged (sharp not available).
 * EXIF embedding is a nice-to-have and not essential for image delivery.
 */
export const writeExifMetadata = async (
    buffer: Buffer,
    _safeParams: SafeParams | any,
    _maturity: any,
): Promise<Buffer> => {
    logPerf("EXIF writing skipped (Workers mode)");
    return buffer;
};
