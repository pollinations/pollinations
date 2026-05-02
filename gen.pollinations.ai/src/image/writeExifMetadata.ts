import debug from "debug";
import { dump, type IExif, insert, TagValues } from "piexif-ts";

const logPerf = debug("pollinations:perf");

export async function writeExifMetadata(
    buffer: Buffer,
    safeParams: object,
    maturity: object,
): Promise<Buffer> {
    const startTime = Date.now();
    try {
        let binaryString = "";
        for (let i = 0; i < buffer.length; i++) {
            binaryString += String.fromCharCode(buffer[i]);
        }

        const params = safeParams as Record<string, unknown>;
        const model = typeof params.model === "string" ? params.model : "";

        const exifObj: IExif = {
            "0th": {
                [TagValues.ImageIFD.Make]: model,
            },
            Exif: {
                [TagValues.ExifIFD.UserComment]: JSON.stringify({
                    ...safeParams,
                    ...maturity,
                }),
            },
        };

        const exifBytes = dump(exifObj);
        const newBinaryString = insert(exifBytes, binaryString);

        const newBuffer = Buffer.alloc(newBinaryString.length);
        for (let i = 0; i < newBinaryString.length; i++) {
            newBuffer[i] = newBinaryString.charCodeAt(i);
        }

        logPerf(`EXIF writing duration: ${Date.now() - startTime}ms`);
        return newBuffer;
    } catch (err) {
        logPerf(`EXIF writing skipped (${Date.now() - startTime}ms): ${err}`);
        return buffer;
    }
}
