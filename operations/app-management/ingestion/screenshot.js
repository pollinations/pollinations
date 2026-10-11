const sharp = require("sharp");

const MAX_BYTES = 5 * 1024 * 1024;
const FORMATS = new Set(["png", "jpeg", "webp"]);
// Browser windows are rarely exactly 16:9; the catalog crops to fit anyway.
const RATIO_TOLERANCE = 0.05;
const RULES =
    "PNG, JPEG, or WebP, at most 5 MB, 16:9 landscape, at least 1280×720";

async function downloadScreenshot(url) {
    const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok)
        throw new Error(`Screenshot download returned HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
}

async function screenshotErrors(buffer) {
    if (buffer.length > MAX_BYTES)
        return [
            `Screenshot is ${(buffer.length / 1024 / 1024).toFixed(1)} MB; it must be ${RULES}.`,
        ];
    let metadata;
    try {
        metadata = await sharp(buffer).metadata();
    } catch {
        return [`Screenshot is not a readable image; it must be ${RULES}.`];
    }
    const { format, width, height } = metadata;
    if (!FORMATS.has(format))
        return [`Screenshot is ${format}; it must be ${RULES}.`];
    const ratio = width / height / (16 / 9);
    if (width < 1280 || height < 720 || Math.abs(ratio - 1) > RATIO_TOLERANCE)
        return [`Screenshot is ${width}×${height}; it must be ${RULES}.`];
    return [];
}

function toCatalogWebp(buffer) {
    return sharp(buffer)
        .resize(1280, 720, { fit: "cover", position: "top" })
        .webp({ quality: 80 })
        .toBuffer();
}

module.exports = { downloadScreenshot, screenshotErrors, toCatalogWebp };
