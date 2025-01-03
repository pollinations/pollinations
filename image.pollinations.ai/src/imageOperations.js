import { exec } from 'child_process';
import tempfile from 'tempfile';
import fs from 'fs/promises';
import { fileTypeFromBuffer } from 'file-type';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { MODELS } from './models.js';
import debug from 'debug';

const logError = debug('pollinations:error');
const logPerf = debug('pollinations:perf');
const logOps = debug('pollinations:ops');

/**
* Applies a blur effect to the image using ImageMagick.
* @param {Buffer} buffer - The image buffer.
* @param {number} [size=8] - The size of the blur effect.
* @returns {Promise<Buffer>} - The blurred image buffer.
*/
export async function blurImage(buffer, size = 12) {
    const { ext } = await fileTypeFromBuffer(buffer);
    const tempImageFile = tempfile({ extension: ext });
    const tempOutputFile = tempfile({ extension: ext });

    await fs.writeFile(tempImageFile, buffer);

    return new Promise((resolve, reject) => {
        const command = `convert ${tempImageFile} -blur 0x${size} ${tempOutputFile}`;
        try {
            exec(command, async (error, stdout, stderr) => {
                try {
                    if (error) {
                        logError(`error: ${error.message}`);
                        reject(error);
                        return;
                    }
                    const bufferBlurred = await fs.readFile(tempOutputFile);
                    await Promise.all([
                        fs.unlink(tempImageFile),
                        fs.unlink(tempOutputFile)
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
export async function resizeImage(buffer, width, height) {
    const { ext } = await fileTypeFromBuffer(buffer);
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
            exec(command, async (error, stdout, stderr) => {
                try {
                    if (error) {
                        logError(`error: ${error.message}`);
                        reject(error);
                        return;
                    }
                    const bufferResized = await fs.readFile(tempOutputFile);
                    await Promise.all([
                        fs.unlink(tempImageFile),
                        fs.unlink(tempOutputFile)
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
export function getLogoPath(safeParams, isChild, isMature) {
    if (!MODELS[safeParams.model].type.startsWith('meoow') && (safeParams["nologo"] || safeParams["nofeed"] || isChild || isMature)) {
        return null;
    }
    return MODELS[safeParams.model].type.startsWith('meoow') ? 'logo_meoow.png' : 'logo.png';
}

/**
* Adds a logo to the image using ImageMagick.
* @param {Buffer} buffer - The image buffer.
* @param {string} logoPath - The path to the logo file.
* @param {Object} safeParams - Parameters for adjusting the logo size.
* @returns {Promise<Buffer>} - The image buffer with the logo added.
*/
export async function addPollinationsLogoWithImagemagick(buffer, logoPath, safeParams) {
    const { ext } = await fileTypeFromBuffer(buffer);
    const tempImageFile = tempfile({ extension: ext });
    const tempOutputFile = tempfile({ extension: "jpg" });

    await fs.writeFile(tempImageFile, buffer);

    const targetWidth = safeParams.width * 0.3;
    const scaleFactor = targetWidth / 200;
    const targetHeight = scaleFactor * 31;

    return new Promise((resolve, reject) => {
        const command = `convert -background none -gravity southeast -geometry ${targetWidth}x${targetHeight}+10+10 ${tempImageFile} ${logoPath} -composite ${tempOutputFile}`;
        try {
            exec(command, async (error, stdout, stderr) => {
                try {
                    if (error) {
                        logError(`error: ${error.message}`);
                        reject(error);
                        return;
                    }
                    const bufferWithLegend = await fs.readFile(tempOutputFile);
                    await Promise.all([
                        fs.unlink(tempImageFile),
                        fs.unlink(tempOutputFile)
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
