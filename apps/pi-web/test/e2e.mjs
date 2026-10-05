// Real end-to-end run: boots the WASIX sandbox in headless Chrome, lets Pi
// create a file, and checks the guest output and the file listing.
//
//   POLLINATIONS_KEY=sk_... node test/e2e.mjs
//
// The first boot downloads ~35 MB of runtime, so this is not a fast test.

import { chromium } from "playwright-core";
import { createStaticServer } from "../serve.mjs";
import { PI_VERSION } from "../src/piConfig.js";

const PORT = Number(process.env.PORT || 8791);
const KEY = process.env.POLLINATIONS_KEY;
const CHROME = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const MODEL = process.env.MODEL || "openai/gpt-5.4-nano";
const PROMPT =
    process.env.PROMPT ||
    "Create squares.mjs that prints the first ten squares, one per line, then run it with node.";

if (!KEY) {
    console.error("set POLLINATIONS_KEY");
    process.exit(2);
}

const server = createStaticServer().listen(PORT);
// A persistent profile keeps the ~35 MB runtime in browser storage so repeat
// runs skip the download.
const context = await chromium.launchPersistentContext(".cache/chrome-profile", {
    executablePath: CHROME,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    viewport: { width: 1280, height: 900 },
});
const page = context.pages()[0] ?? (await context.newPage());
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 400)));
page.on("console", (m) => {
    const text = m.text();
    if (!text.includes("MF-Vitest")) console.log("[page]", text.slice(0, 240));
});

await page.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });

await page.evaluate(
    ({ key, prompt }) => {
        document.getElementById("key").value = key;
        document.getElementById("model").value = document.getElementById("model").value;
        document.getElementById("prompt").value = prompt;
    },
    { key: KEY, prompt: PROMPT },
);

console.log("booting sandbox ...");
await page.evaluate(() => window.piWeb.connect());
await page.waitForFunction(
    () => document.getElementById("status").textContent === "ready",
    null,
    { timeout: 900000 },
);
console.log("sandbox ready, running Pi ...");

await page.evaluate(() => window.piWeb.run());
await page.waitForFunction(
    () => /exit -?\d+/.test(document.getElementById("log").textContent),
    null,
    { timeout: 900000 },
);

const log = await page.textContent("#log");
const files = await page.evaluate(async () =>
    (await window.piWeb.session.listFiles("/workspace")).map((e) => e.path),
);
console.log("\n=== guest log (tail) ===\n" + log.trim().slice(-2500));
console.log("\n=== files ===\n" + files.join("\n"));

let content = null;
try {
    content = await page.evaluate(() => window.piWeb.session.readText("/workspace/squares.mjs"));
} catch {}
console.log("\n=== squares.mjs ===\n" + content);

await context.close();
server.close();

const ok =
    files.includes("/workspace/squares.mjs") &&
    content !== null &&
    log.includes("Successfully wrote to squares.mjs") &&
    // The squares are printed by `node squares.mjs` inside the sandbox; in the
    // JSON event stream the newlines arrive escaped.
    log.includes("1\\n4\\n9\\n16\\n25\\n36\\n49\\n64\\n81\\n100");

console.log(`\nE2E ${ok ? "PASS" : "FAIL"}`);

if (ok && process.env.TRANSCRIPT) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
        process.env.TRANSCRIPT,
        [
            "# Real end-to-end run",
            "",
            `Model: \`${MODEL}\``,
            "Environment: headless Chrome, WASIX sandbox via `@wasmer/sdk`, Pi",
            "`" + PI_VERSION + "`, network disabled, requests answered by the page bridge.",
            "",
            "## Prompt",
            "",
            "```",
            PROMPT,
            "```",
            "",
            "## Guest output (tail)",
            "",
            "```",
            log.trim().slice(-2500),
            "```",
            "",
            "## Files in /workspace",
            "",
            "```",
            files.join("\n"),
            "```",
            "",
            "## squares.mjs",
            "",
            "```js",
            content ?? "",
            "```",
            "",
        ].join("\n"),
    );
    console.log(`transcript -> ${process.env.TRANSCRIPT}`);
}
process.exit(ok ? 0 : 1);
