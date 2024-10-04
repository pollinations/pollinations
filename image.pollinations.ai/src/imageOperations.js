import { exec } from 'child_process';
import tempfile from 'tempfile';
import fs from 'fs';
import { fileTypeFromBuffer } from 'file-type';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { MODELS } from './models.js';

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

    fs.writeFileSync(tempImageFile, buffer);

    return new Promise((resolve, reject) => {
        exec(`convert ${tempImageFile} -blur 0x${size} ${tempOutputFile}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`error: ${error.message}`);
                reject(error);
                return;
            }
            const bufferBlurred = fs.readFileSync(tempOutputFile);
            fs.unlinkSync(tempImageFile);
            fs.unlinkSync(tempOutputFile);
            resolve(bufferBlurred);
        });
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

    fs.writeFileSync(tempImageFile, buffer);

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
        exec(`convert ${tempImageFile} -resize ${width}x${height}! ${tempOutputFile}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`error: ${error.message}`);
                reject(error);
                return;
            }
            const bufferResized = fs.readFileSync(tempOutputFile);
            fs.unlinkSync(tempImageFile);
            fs.unlinkSync(tempOutputFile);
            resolve(bufferResized);
        });
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

    fs.writeFileSync(tempImageFile, buffer);

    const targetWidth = safeParams.width * 0.3;
    const scaleFactor = targetWidth / 200;
    const targetHeight = scaleFactor * 31;

    return new Promise((resolve, reject) => {
        exec(`convert -background none -gravity southeast -geometry ${targetWidth}x${targetHeight}+10+10 ${tempImageFile} ${logoPath} -composite ${tempOutputFile}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`error: ${error.message}`);
                reject(error);
                return;
            }
            const bufferWithLegend = fs.readFileSync(tempOutputFile);
            fs.unlinkSync(tempImageFile);
            fs.unlinkSync(tempOutputFile);
            resolve(bufferWithLegend);
        });
    });
}



/**
 * Checks if the image is NSFW.
 * @param {Buffer} buffer - The image buffer to check.
 * @returns {Promise<Object>} - The result of the NSFW check.
 */
export const nsfwCheck = async (buffer) => {
    const form = new FormData();
    form.append('file', buffer, { filename: 'image.jpg' });
    const nsfwCheckStartTime = Date.now();
    const res = await fetch('http://localhost:10000/check', { method: 'POST', body: form });
    const nsfwCheckEndTime = Date.now();
    console.log(`NSFW check duration: ${nsfwCheckEndTime - nsfwCheckStartTime}ms`);
    const json = await res.json();
    return json;
};
