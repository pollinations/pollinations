import sharp from 'sharp';

/**
 * Writes EXIF metadata to the image buffer.
 * @param {Buffer} buffer - The image buffer.
 * @param {Object} safeParams - Parameters to embed as metadata.
 * @param {Object} maturity - Additional metadata to embed.
 * @returns {Promise<Buffer>} - The image buffer with metadata.
 */
export const writeExifMetadata = async (buffer, safeParams, maturity) => {
    const exif_start_time = Date.now();

    const metadata = {
        IFD0: {
            UserComment: JSON.stringify({ ...safeParams, ...maturity }),
            Make: safeParams.model
        }
    };

    const bufferWithMetadata = await sharp(buffer)
        .withExifMerge(metadata)
        .toBuffer();

    const exif_end_time = Date.now();
    console.log(`Exif writing duration: ${exif_end_time - exif_start_time}ms`);

    return bufferWithMetadata;
};