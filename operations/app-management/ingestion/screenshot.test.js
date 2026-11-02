const assert = require("node:assert/strict");
const test = require("node:test");
const sharp = require("sharp");
const { screenshotErrors, toCatalogWebp } = require("./screenshot.js");

const RULES = "it must be PNG, JPEG, or WebP, at most 5 MB.";

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

test("accepts other ratios and lower resolutions", async () => {
    for (const [width, height] of [
        [1080, 1920],
        [1280, 800],
        [960, 540],
        [338, 338],
    ]) {
        const source = await image(width, height);
        assert.deepEqual(await screenshotErrors(source), []);
        const output = await sharp(await toCatalogWebp(source)).metadata();
        assert.equal(output.width, 1280);
        assert.equal(output.height, 720);
    }
});

test("rejects invalid images, unsupported formats and oversized files", async () => {
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

// Regression: a linked screenshot URL is untrusted input. The size cap has to be
// enforced while streaming, not only after the whole body is buffered in memory.
test("refuses an oversized screenshot before buffering the whole body", async () => {
    const { downloadScreenshot } = require("./screenshot.js");
    const realFetch = globalThis.fetch;
    let pulled = 0;
    try {
        globalThis.fetch = async () =>
            new Response(
                new ReadableStream({
                    pull(controller) {
                        // 1 MB per chunk, keep producing until cancelled
                        pulled += 1;
                        if (pulled > 20) return controller.close();
                        controller.enqueue(new Uint8Array(1024 * 1024));
                    },
                }),
                { status: 200, headers: { "content-type": "image/png" } },
            );
        await assert.rejects(
            () => downloadScreenshot("https://example.com/huge.png"),
            /larger than|must be PNG/,
        );
        assert.ok(
            pulled <= 7,
            `should stop reading shortly after 5 MB, pulled ${pulled} chunks`,
        );
    } finally {
        globalThis.fetch = realFetch;
    }
});

test("refuses when content-length already exceeds the cap", async () => {
    const { downloadScreenshot } = require("./screenshot.js");
    const realFetch = globalThis.fetch;
    try {
        globalThis.fetch = async () =>
            new Response(new Uint8Array(16), {
                status: 200,
                headers: { "content-length": String(6 * 1024 * 1024) },
            });
        await assert.rejects(
            () => downloadScreenshot("https://example.com/big.png"),
            /6\.0 MB; it must be PNG, JPEG, or WebP/,
        );
    } finally {
        globalThis.fetch = realFetch;
    }
});
