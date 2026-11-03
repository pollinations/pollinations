#!/usr/bin/env node

// Converts the submitted screenshot to the catalog format, uploads it to
// media.pollinations.ai, and prints the public URL.
const { downloadScreenshot, toCatalogWebp } = require("./screenshot.js");

async function main() {
    const { SCREENSHOT_URL, POLLINATIONS_API_KEY } = process.env;
    if (!SCREENSHOT_URL || !POLLINATIONS_API_KEY)
        throw new Error("SCREENSHOT_URL and POLLINATIONS_API_KEY are required");

    const webp = await toCatalogWebp(await downloadScreenshot(SCREENSHOT_URL));
    const form = new FormData();
    form.append(
        "file",
        new Blob([webp], { type: "image/webp" }),
        "screenshot.webp",
    );
    const response = await fetch("https://media.pollinations.ai/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${POLLINATIONS_API_KEY}` },
        body: form,
        signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok)
        throw new Error(
            `Screenshot upload returned HTTP ${response.status}: ${await response.text()}`,
        );
    const { url } = await response.json();
    process.stdout.write(`${url}\n`);
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
