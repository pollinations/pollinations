// Posts the daily community leaderboards to #dev-community-models, as the
// EC2 community monitor did: GitHub Actions runs this once a day
// (.github/workflows/monitor-community-leaderboards.yml). Each board's rows
// come from its Tinybird pipe, the board is screenshotted in Chrome, and
// both go out in one webhook message with the images attached.
//
//   node post.mjs [text] [image] [--dry-run <dir>]
//
// A board with no model busy enough is skipped. A board that fails is left
// out and fails the run once the others are posted; rerun it by name.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { imageBoard } from "./image-board.js";
import { textBoard } from "./text-board.js";

const TINYBIRD = "https://api.europe-west2.gcp.tinybird.co/v0/pipes";
const BOARDS = {
    text: { pipe: "infra_watch_text_leaderboard", build: textBoard },
    image: { pipe: "infra_watch_image_leaderboard", build: imageBoard },
};

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run")
    ? args[args.indexOf("--dry-run") + 1]
    : null;
const named = Object.keys(BOARDS).filter((name) => args.includes(name));
const wanted = named.length ? named : Object.keys(BOARDS);
const date = new Date().toISOString().slice(0, 10);

async function rows(pipe) {
    const res = await fetch(`${TINYBIRD}/${pipe}.json`, {
        headers: { authorization: `Bearer ${process.env.TINYBIRD_TOKEN}` },
    });
    if (!res.ok) throw new Error(`tinybird ${pipe} -> ${res.status}`);
    return (await res.json()).data;
}

// The whole board at 1200px wide, once its embedded fonts are in. The page
// needs no script, so none runs.
async function screenshot(browser, html) {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setViewport({ width: 1200, height: 800 });
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluateHandle("document.fonts.ready");
    return page.screenshot({ fullPage: true, type: "png" });
}

// One message: the posts in order, each board's image attached below them.
async function post(boards) {
    const form = new FormData();
    form.append(
        "payload_json",
        JSON.stringify({
            content: boards.map((b) => b.markdown).join("\n\n"),
            allowed_mentions: { parse: [] },
        }),
    );
    for (const [i, b] of boards.entries())
        form.append(
            `files[${i}]`,
            new Blob([b.png], { type: "image/png" }),
            b.file,
        );
    const url = new URL(process.env.COMMUNITY_WEBHOOK_URL);
    url.searchParams.set("wait", "true");
    const res = await fetch(url, { method: "POST", body: form });
    if (!res.ok)
        throw new Error(`discord -> ${res.status} ${await res.text()}`);
}

const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH,
    // GitHub's Ubuntu 24.04 runners block Chrome's user-namespace sandbox;
    // the page is our own HTML with scripts off.
    args: ["--no-sandbox"],
});
const built = [];
let failed = 0;
try {
    for (const name of wanted) {
        try {
            const board = BOARDS[name].build(
                await rows(BOARDS[name].pipe),
                date,
            );
            if (!board) {
                console.log(`${name}: no model busy enough, skipped`);
                continue;
            }
            const png = await screenshot(browser, board.html);
            built.push({
                ...board,
                png,
                file: `${name}-leaderboard-${date}.png`,
            });
        } catch (error) {
            failed++;
            console.error(`${name}: ${error.message}`);
        }
    }
} finally {
    await browser.close();
}

if (dryRun) {
    await mkdir(dryRun, { recursive: true });
    for (const b of built) await writeFile(join(dryRun, b.file), b.png);
    await writeFile(
        join(dryRun, "message.md"),
        built.map((b) => b.markdown).join("\n\n"),
    );
    console.log(`dry run: wrote ${built.length} board(s) to ${dryRun}`);
} else if (built.length) {
    await post(built);
    console.log(`posted: ${built.map((b) => b.file).join(", ")}`);
}
if (failed) process.exit(1);
