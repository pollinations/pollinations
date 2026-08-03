import { exec } from "node:child_process";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import debug from "debug";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import tempfile from "tempfile";

const logError = debug("pollinations:error");

/**
 * Applies a blur effect to the image using ImageMagick.
 * @param {Buffer} buffer - The image buffer.
 * @param {number} [size=8] - The size of the blur effect.
 * @returns {Promise<Buffer>} - The blurred image buffer.
 */
export async function blurImage(
    buffer: Buffer,
    size: number = 12,
): Promise<Buffer> {
    const fileTypeResult = await fileTypeFromBuffer(buffer);
    if (!fileTypeResult) {
        throw new Error("Failed to determine file type");
    }
    const { ext } = fileTypeResult;

    const tempImageFile = tempfile({ extension: ext });
    const tempOutputFile = tempfile({ extension: ext });

    await fs.writeFile(tempImageFile, buffer);

    return new Promise((resolve, reject) => {
        const command = `convert ${tempImageFile} -blur 0x${size} ${tempOutputFile}`;
        try {
            exec(command, async (error, _stdout, _stderr) => {
                try {
                    if (error) {
                        logError(`error: ${error.message}`);
                        reject(error);
                        return;
                    }
                    const bufferBlurred = await fs.readFile(tempOutputFile);
                    await Promise.all([
                        fs.unlink(tempImageFile),
                        fs.unlink(tempOutputFile),
                    ]);
                    resolve(bufferBlurred);
                } catch (err) {
                    reject(err);
                }
            });
        } catch (error) {
            logError(`error: ${error.message}`);
            reject(error);
        }
    });
}

/**
 * Resizes the image to the desired dimensions using ImageMagick.
 * @param {Buffer} buffer - The image buffer.
 * @param {number} width - The desired width.
 * @param {number} height - The desired height.
 * @returns {Promise<Buffer>} - The resized image buffer.
 */
export async function resizeImage(
    buffer: Buffer,
    width: number,
    height: number,
): Promise<Buffer> {
    const fileTypeResult = await fileTypeFromBuffer(buffer);
    if (!fileTypeResult) {
        throw new Error("Failed to determine file type");
    }
    const { ext } = fileTypeResult;

    const tempImageFile = tempfile({ extension: ext });
    const tempOutputFile = tempfile({ extension: "jpg" });

    await fs.writeFile(tempImageFile, buffer);

    // Calculate the scaling factor based on the total pixel count
    const maxPixels = 2048 * 2048;
    const currentPixels = width * height;
    const scaleFactor = Math.sqrt(maxPixels / currentPixels);

    // Apply scaling if the image exceeds the maximum pixel count
    if (currentPixels > maxPixels) {
        width = Math.round(width * scaleFactor);
        height = Math.round(height * scaleFactor);
    }

    return new Promise((resolve, reject) => {
        const command = `convert ${tempImageFile} -resize ${width}x${height}! ${tempOutputFile}`;
        try {
            exec(command, async (error, _stdout, _stderr) => {
                try {
                    if (error) {
                        logError(`error: ${error.message}`);
                        reject(error);
                        return;
                    }
                    const bufferResized = await fs.readFile(tempOutputFile);
                    await Promise.all([
                        fs.unlink(tempImageFile),
                        fs.unlink(tempOutputFile),
                    ]);
                    resolve(bufferResized);
                } catch (err) {
                    reject(err);
                }
            });
        } catch (error) {
            logError(`error: ${error.message}`);
            reject(error);
        }
    });
}

const LOGO_ASPECT_RATIO = 1024 / 126;
const BLACK_LOGO_PATH = fileURLToPath(
    new URL("../assets/lockup-horizontal-black.png", import.meta.url),
);
const WHITE_LOGO_PATH = fileURLToPath(
    new URL("../assets/lockup-horizontal-white.png", import.meta.url),
);

export type LogoPlacement = {
    width: number;
    height: number;
    left: number;
    top: number;
    outline: number;
};

/**
 * Keep the horizontal lockup readable without letting it dominate the image.
 */
export function getLogoPlacement(width: number, height: number): LogoPlacement {
    const shortSide = Math.min(width, height);
    const margin = Math.max(
        1,
        Math.min(
            Math.max(10, Math.min(20, Math.round(shortSide * 0.015))),
            Math.floor(width / 8),
            Math.floor(height / 8),
        ),
    );
    const availableWidth = Math.max(1, width - margin * 2);
    const availableHeight = Math.max(1, height - margin * 2);
    const desiredHeight = Math.max(
        16,
        Math.min(28, Math.round(shortSide * 0.025)),
    );
    const logoHeight = Math.max(
        1,
        Math.min(
            desiredHeight,
            availableHeight,
            Math.max(1, Math.floor(availableWidth / LOGO_ASPECT_RATIO)),
        ),
    );
    const logoWidth = Math.min(
        availableWidth,
        Math.max(1, Math.round(logoHeight * LOGO_ASPECT_RATIO)),
    );

    return {
        width: logoWidth,
        height: logoHeight,
        left: width - logoWidth - margin,
        top: height - logoHeight - margin,
        outline: logoHeight >= 24 ? 2 : 1,
    };
}

/**
 * Adds the Pollinations horizontal lockup in the bottom-right corner.
 * A small black outline keeps the white lockup legible on light backgrounds.
 * The result is encoded once as the final quality-90 JPEG response.
 */
export async function addPollinationsLogo(buffer: Buffer): Promise<Buffer> {
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) {
        throw new Error("Failed to determine image dimensions");
    }

    const placement = getLogoPlacement(metadata.width, metadata.height);
    const resizeOptions = {
        width: placement.width,
        height: placement.height,
        fit: "contain" as const,
    };
    const [blackLogo, whiteLogo] = await Promise.all([
        sharp(BLACK_LOGO_PATH).resize(resizeOptions).png().toBuffer(),
        sharp(WHITE_LOGO_PATH).resize(resizeOptions).png().toBuffer(),
    ]);
    const outlineOffsets = [-1, 0, 1]
        .flatMap((x) => [-1, 0, 1].map((y) => ({ x, y })))
        .filter(({ x, y }) => x !== 0 || y !== 0);

    return await sharp(buffer)
        .composite([
            ...outlineOffsets.map(({ x, y }) => ({
                input: blackLogo,
                left: placement.left + x * placement.outline,
                top: placement.top + y * placement.outline,
            })),
            {
                input: whiteLogo,
                left: placement.left,
                top: placement.top,
            },
        ])
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer();
}
