import debug from "debug";
import * as piexif from "piexif-ts";

const logPerf = debug("pollinations:perf");

interface SafeParams {
    model: string;
    [key: string]: unknown;
}

/**
 * Writes EXIF metadata to a JPEG buffer using piexif-ts (pure JS, Workers-compatible).
 * Matches the original sharp-based implementation: sets Make and UserComment.
 */
export const writeExifMetadata = async (
    buffer: Buffer,
    safeParams: SafeParams | any,
    maturity: any,
): Promise<Buffer> => {
    const startTime = Date.now();

    try {
        // piexif-ts works with binary strings
        const binaryString = buffer.reduce(
            (str, byte) => str + String.fromCharCode(byte),
            "",
        );

        // Build EXIF object matching original sharp implementation
        const exifObj: piexif.IExif = {
            "0th": {
                [piexif.TagValues.ImageIFD.Make]: safeParams.model || "",
            },
            Exif: {
                [piexif.TagValues.ExifIFD.UserComment]: JSON.stringify({
                    ...safeParams,
                    ...maturity,
                }),
            },
        };

        const exifBytes = piexif.dump(exifObj);
        const newBinaryString = piexif.insert(exifBytes, binaryString);

        // Convert back to Buffer
        const newBuffer = Buffer.alloc(newBinaryString.length);
        for (let i = 0; i < newBinaryString.length; i++) {
            newBuffer[i] = newBinaryString.charCodeAt(i);
        }

        logPerf(`EXIF writing duration: ${Date.now() - startTime}ms`);
        return newBuffer;
    } catch (err) {
        // If EXIF writing fails (e.g., non-JPEG input), return original buffer
        logPerf(`EXIF writing failed (${Date.now() - startTime}ms): ${err}`);
        return buffer;
    }
};
