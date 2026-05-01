import debug from "debug";

const logPerf = debug("pollinations:perf");

export async function writeExifMetadata(
    buffer: Buffer,
    _safeParams: object,
    _maturity: object,
): Promise<Buffer> {
    logPerf("EXIF metadata writing skipped in Workers image path");
    return buffer;
}
