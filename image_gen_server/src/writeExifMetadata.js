import tempfile from 'tempfile';
import fs from 'fs';
import { ExifTool } from 'exiftool-vendored';

/**
 * Writes EXIF metadata to the image buffer.
 * @param {Buffer} buffer - The image buffer.
 * @param {Object} safeParams - Parameters to embed as metadata.
 * @param {Object} maturity - Additional metadata to embed.
 * @returns {Promise<Buffer>} - The image buffer with metadata.
 */
export const writeExifMetadata = async (buffer, safeParams, maturity) => {
    const exif_start_time = Date.now();
    const exifTool = new ExifTool();
    const tempImageFile = tempfile({ extension: "jpg" });
    fs.writeFileSync(tempImageFile, buffer);

    await exifTool.write(tempImageFile, {
        UserComment: JSON.stringify({ ...safeParams, ...maturity }),
        Make: "Stable Diffusion"
    });

    const exif_end_time = Date.now();
    console.log(`Exif writing duration: ${exif_end_time - exif_start_time}ms`);

    const bufferWithMetadata = fs.readFileSync(tempImageFile); // Re-read to get the version with metadata
    await exifTool.end();
    if (tempImageFile) fs.unlinkSync(tempImageFile);

    return bufferWithMetadata;
};