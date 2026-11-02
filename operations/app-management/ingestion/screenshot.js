const sharp = require("sharp");

const MAX_BYTES = 5 * 1024 * 1024;
const FORMATS = new Set(["png", "jpeg", "webp"]);
const RULES = "PNG, JPEG, or WebP, at most 5 MB";

async function downloadScreenshot(url) {
    const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok)
        throw new Error(`Screenshot download returned HTTP ${response.status}`);

    // Refuse oversized bodies before buffering them: a linked URL is untrusted
    // input, and reading an unlimited body into memory can exhaust the worker
    // long before screenshotErrors() gets to reject it for exceeding 5 MB.
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
        throw new Error(
            `Screenshot is ${(declared / 1024 / 1024).toFixed(1)} MB; it must be ${RULES}`,
        );
    }
    if (!response.body) return Buffer.from(await response.arrayBuffer());

    const chunks = [];
    let total = 0;
    const reader = response.body.getReader();
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > MAX_BYTES) {
                await reader.cancel().catch(() => {});
                throw new Error(
                    `Screenshot is larger than ${RULES}; refusing to buffer it`,
                );
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock?.();
    }
    return Buffer.concat(
        chunks.map((c) => Buffer.from(c)),
        total,
    );
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
    const { format } = metadata;
    if (!FORMATS.has(format))
        return [`Screenshot is ${format}; it must be ${RULES}.`];
    return [];
}

function toCatalogWebp(buffer) {
    return sharp(buffer)
        .resize(1280, 720, { fit: "cover", position: "top" })
        .webp({ quality: 80 })
        .toBuffer();
}

module.exports = { downloadScreenshot, screenshotErrors, toCatalogWebp };
