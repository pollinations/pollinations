// Posts the daily community leaderboards to #dev-community-models, as the
// EC2 community monitor did: GitHub Actions runs this once a day
// (.github/workflows/monitor-community-leaderboards.yml). Each board's rows
// come from its Tinybird pipe, the board is screenshotted in Chrome, and
// each board goes out as its own webhook message, its image right below its
// post.
//
// Run from operations/infra-watch, with the secrets from its SOPS file:
//
//   sops exec-env secrets.vars.json 'node leaderboard/post.mjs [text] [image]'
//
// `--dry-run <dir>` writes the boards and the post there instead. CHROME_PATH
// points at Chrome when it isn't where GitHub's Ubuntu runners have it.
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

// In GitHub Actions, the secrets this reads are hidden from the job's log.
if (process.env.GITHUB_ACTIONS)
    for (const name of ["TINYBIRD_TOKEN", "COMMUNITY_WEBHOOK_URL"])
        console.log(`::add-mask::${process.env[name]}`);

async function rows(pipe) {
    const res = await fetch(`${TINYBIRD}/${pipe}.json`, {
        headers: { authorization: `Bearer ${process.env.TINYBIRD_TOKEN}` },
    });
    if (!res.ok) throw new Error(`tinybird ${pipe} -> ${res.status}`);
    return (await res.json()).data;
}

// Public community models by every name a pipe row can carry. Private
// models are never in this catalog, so they never reach a board.
async function listed() {
    const res = await fetch(
        "https://gen.pollinations.ai/models?community=true&reliability=all",
    );
    if (!res.ok) throw new Error(`models -> ${res.status}`);
    const body = await res.json();
    return new Set(
        (Array.isArray(body) ? body : body.data)
            .flatMap((m) => [m.name, ...(m.aliases ?? [])])
            .map((name) => name.replace(/^community\//, "")),
    );
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

// One board's message: its post, with its image attached below it.
async function post(board) {
    const form = new FormData();
    form.append(
        "payload_json",
        JSON.stringify({
            content: board.markdown,
            allowed_mentions: { parse: [] },
        }),
    );
    form.append(
        "files[0]",
        new Blob([board.png], { type: "image/png" }),
        board.file,
    );
    const url = new URL(process.env.COMMUNITY_WEBHOOK_URL);
    url.searchParams.set("wait", "true");
    const res = await fetch(url, { method: "POST", body: form });
    if (!res.ok)
        throw new Error(`discord -> ${res.status} ${await res.text()}`);
}

const publicModels = await listed();
const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
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
                publicModels,
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
    for (const b of built) {
        await writeFile(join(dryRun, b.file), b.png);
        await writeFile(
            join(dryRun, b.file.replace(/\.png$/, ".md")),
            b.markdown,
        );
    }
    console.log(`dry run: wrote ${built.length} board(s) to ${dryRun}`);
} else {
    // In order, text then image; a board whose post fails is left out and
    // fails the run, like one that could not be built.
    for (const b of built) {
        try {
            await post(b);
            console.log(`posted: ${b.file}`);
        } catch (error) {
            failed++;
            console.error(`${b.file}: ${error.message}`);
        }
    }
}
if (failed) process.exit(1);
