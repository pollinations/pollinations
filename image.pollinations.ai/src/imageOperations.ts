import { exec } from "node:child_process";
import fs from "node:fs/promises";
import debug from "debug";
import { fileTypeFromBuffer } from "file-type";
import tempfile from "tempfile";
import { MODELS } from "./models.js";
import { ImageParams } from "./params.js";

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

/**
 * Determines the appropriate logo path based on the parameters and maturity flags.
 * @param {Object} safeParams - The safe parameters for the image generation.
 * @param {boolean} isChild - Flag indicating if the image is considered child content.
 * @param {boolean} isMature - Flag indicating if the image is considered mature content.
 * @returns {string|null} - The path to the logo file or null if no logo should be added.
 */
export function getLogoPath(
    safeParams: ImageParams,
    isChild: boolean,
    isMature: boolean,
): string | null {
    if (
        !MODELS[safeParams.model].type.startsWith("meoow") &&
        (safeParams.nologo || safeParams.nofeed || isChild || isMature)
    ) {
        return null;
    }
    return "logo.png";
}

/**
 * Adds a logo to the image using ImageMagick.
 * @param {Buffer} buffer - The image buffer.
 * @param {string} logoPath - The path to the logo file.
 * @param {Object} safeParams - Parameters for adjusting the logo size.
 * @returns {Promise<Buffer>} - The image buffer with the logo added.
 */
export async function addPollinationsLogoWithImagemagick(
    buffer: Buffer,
    logoPath: string,
    safeParams: ImageParams,
): Promise<Buffer> {
    const fileTypeResult = await fileTypeFromBuffer(buffer);
    if (!fileTypeResult) {
        throw new Error("Failed to determine file type");
    }
    const { ext } = fileTypeResult;

    const tempImageFile = tempfile({ extension: ext });

    // Use PNG for gptimage model, JPG otherwise
    const outputExt = "png";
    const tempOutputFile = tempfile({ extension: outputExt });

    await fs.writeFile(tempImageFile, buffer);

    const targetWidth = safeParams.width * 0.3;
    const scaleFactor = targetWidth / 200;
    const targetHeight = scaleFactor * 31;

    return new Promise((resolve, reject) => {
        // Note: -background none is crucial for preserving transparency
        const command = [
            `convert`,
            `-background none`,
            `-gravity southeast`,
            `-geometry ${targetWidth}x${targetHeight}+10+10 ${tempImageFile} ${logoPath}`,
            `-composite ${tempOutputFile}`,
        ].join(" ");
        try {
            exec(command, async (error, _stdout, _stderr) => {
                try {
                    if (error) {
                        logError(`error: ${error.message}`);
                        reject(error);
                        return;
                    }
                    const bufferWithLegend = await fs.readFile(tempOutputFile);
                    await Promise.all([
                        fs.unlink(tempImageFile),
                        fs.unlink(tempOutputFile),
                    ]);
                    resolve(bufferWithLegend);
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
