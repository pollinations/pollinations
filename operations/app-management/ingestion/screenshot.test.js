const assert = require("node:assert/strict");
const test = require("node:test");
const sharp = require("sharp");
const { screenshotErrors, toCatalogWebp } = require("./screenshot.js");

const RULES =
    "it must be PNG, JPEG, or WebP, at most 5 MB, 16:9 landscape, at least 1280×720.";

function image(width, height, format = "png") {
    return sharp({
        create: { width, height, channels: 3, background: "#336699" },
    })
        .toFormat(format)
        .toBuffer();
}

test("accepts 16:9 screenshots in supported formats", async () => {
    assert.deepEqual(await screenshotErrors(await image(1920, 1080)), []);
    assert.deepEqual(
        await screenshotErrors(await image(1366, 768, "jpeg")),
        [],
    );
    assert.deepEqual(
        await screenshotErrors(await image(2560, 1440, "webp")),
        [],
    );
});

test("rejects screenshots outside the size and format rules", async () => {
    for (const [width, height] of [
        [1080, 1920],
        [1280, 800],
        [960, 540],
    ]) {
        assert.deepEqual(await screenshotErrors(await image(width, height)), [
            `Screenshot is ${width}×${height}; ${RULES}`,
        ]);
    }
    assert.deepEqual(await screenshotErrors(await image(1920, 1080, "gif")), [
        `Screenshot is gif; ${RULES}`,
    ]);
    assert.deepEqual(await screenshotErrors(Buffer.from("not an image")), [
        `Screenshot is not a readable image; ${RULES}`,
    ]);
    assert.deepEqual(await screenshotErrors(Buffer.alloc(6 * 1024 * 1024)), [
        `Screenshot is 6.0 MB; ${RULES}`,
    ]);
});

test("converts screenshots to 1280×720 WebP", async () => {
    const { format, width, height } = await sharp(
        await toCatalogWebp(await image(2560, 1440)),
    ).metadata();
    assert.deepEqual(
        { format, width, height },
        {
            format: "webp",
            width: 1280,
            height: 720,
        },
    );
});
