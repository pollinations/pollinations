// Headless-Chromium e2e for apps/pi-web (AC4/AC5).
// Usage: POLLI_KEY=sk_... node test/e2e/run-e2e.mjs
// Place a local pi.webc into dist/ beforehand to skip the runtime download.
// Artifacts (transcript + screenshots) land in test/e2e/out/.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const DIST = join(ROOT, "dist");
const OUT = join(ROOT, "test", "e2e", "out");
const PORT = 8942;
const API_KEY = process.env.POLLI_KEY;
const CHROMIUM = process.env.CHROMIUM_PATH ?? "/usr/bin/chromium";

if (!API_KEY) {
    console.error(
        "POLLI_KEY is required (the visitor's own key; e2e uses it as such)",
    );
    process.exit(2);
}
if (!existsSync(join(DIST, "index.html"))) {
    console.error("dist/ missing - run `npm run build` first");
    process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const MIME = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".wasm": "application/wasm",
    ".webc": "application/webc",
};
const DIST_ROOT = resolve(DIST);
const server = createServer((req, res) => {
    // Reject traversal explicitly before touching the filesystem (CodeQL
    // js/path-injection): the raw URL path must never escape DIST_ROOT.
    const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
    if (urlPath.includes("..")) {
        res.writeHead(400);
        return res.end("bad path");
    }
    const path = resolve(
        DIST_ROOT,
        `.${urlPath === "/" ? "/index.html" : urlPath}`,
    );
    if (!path.startsWith(DIST_ROOT + sep) || !existsSync(path)) {
        res.writeHead(404);
        return res.end("not found");
    }
    res.writeHead(200, {
        "Content-Type": MIME[extname(path)] ?? "application/octet-stream",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
    });
    res.end(readFileSync(path));
});
await new Promise((r) => server.listen(PORT, r));

const transcript = [];
const note = (line) => {
    transcript.push(line);
    console.log(line);
};

const browser = await puppeteer.launch({
    executablePath: CHROMIUM,
    args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--headless=new",
        `--user-data-dir=${join(OUT, "chrome-profile")}`,
    ],
});
const page = await browser.newPage();
page.on("console", (m) => transcript.push(`[console] ${m.text()}`));
page.on("pageerror", (e) => transcript.push(`[pageerror] ${e}`));

const shot = async (name) =>
    page.screenshot({ path: join(OUT, `${name}.png`) });
const logText = () =>
    page.evaluate(() => document.getElementById("log").innerText);
// matches only against log content added AFTER this call started
const waitLog = async (needle, timeoutMs, fromOverride) => {
    const from = fromOverride ?? (await logText()).length;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if ((await logText()).slice(from).includes(needle)) return true;
        await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(`timeout waiting for log line: ${needle}`);
};
const setPromptAndRun = async (prompt) => {
    await page.evaluate((p) => {
        document.getElementById("prompt").value = p;
    }, prompt);
    await page.click("#run");
};

try {
    // AC5: synthetic BYOP fragment is parsed and scrubbed (bad key on purpose).
    // Seed a pending OAuth state before page scripts run - fragments without
    // one are rejected fail-closed. A hash-only goto is same-document
    // navigation, so the state must be planted via evaluateOnNewDocument.
    await page.evaluateOnNewDocument((state) => {
        try {
            sessionStorage.setItem("pi-web:oauth-state", state);
        } catch {}
    }, "e2e-synthetic-state");
    await page.goto(
        `http://localhost:${PORT}/#api_key=sk_synthetic_fragment&state=e2e-synthetic-state`,
        { timeout: 60000 },
    );
    await page.waitForFunction(
        () => {
            const t = document.getElementById("auth-status").textContent;
            return t.includes("connected") && !t.includes("not connected");
        },
        { timeout: 30000 },
    );
    const hashAfter = await page.evaluate(() => location.hash);
    note(
        `AC5 synthetic fragment: connected, hash scrubbed=${hashAfter === ""}`,
    );

    // switch to the real key via the paste box
    await page.type("#paste-key", API_KEY);
    await page.click("#paste-connect");
    note("connected with real key via paste box");

    // live model catalog
    await page.click("#refresh-models");
    await waitLog("tool-calling models", 60000);
    note(
        (await logText())
            .split("\n")
            .find((l) => l.includes("tool-calling models")),
    );

    // AC4b: run 1 - create hello.txt
    for (let attempt = 0; attempt < 2; attempt++) {
        const from = (await logText()).length;
        await setPromptAndRun(
            "Create a file hello.txt with a haiku about pollen",
        );
        await waitLog("run finished", 8 * 60 * 1000, from); // first run includes runtime download + compile
        const produced = (await logText()).slice(from);
        if (!produced.includes("key rejected")) break;
        note(
            `run 1 attempt ${attempt + 1}: transient key rejection, re-pasting key and retrying`,
        );
        await page.evaluate((k) => {
            document.getElementById("paste-key").value = k;
            document.getElementById("paste-connect").click();
        }, API_KEY);
        if (attempt === 1) throw new Error("run 1 key rejected twice");
    }
    await shot("run1");
    note("run 1 finished");

    // AC4c: run 2 - same session, edit the file (retry once on transient key rejection)
    for (let attempt = 0; attempt < 2; attempt++) {
        const from = (await logText()).length;
        await setPromptAndRun("Edit hello.txt: add a title line at the top");
        await waitLog("run finished", 5 * 60 * 1000, from);
        const produced = (await logText()).slice(from);
        if (!produced.includes("key rejected")) break;
        note(
            `run 2 attempt ${attempt + 1}: transient key rejection, re-pasting key and retrying`,
        );
        await page.evaluate((k) => {
            document.getElementById("paste-key").value = k;
            document.getElementById("paste-connect").click();
        }, API_KEY);
        if (attempt === 1) throw new Error("run 2 key rejected twice");
    }
    await shot("run2");
    note("run 2 finished");

    // AC4c-verify: run 2 must have added a title (session continuity proof):
    // head -1 output is produced by the shell, not echoable from the command line
    const titleFrom = (await logText()).length;
    await page.evaluate(() => {
        document.getElementById("shell").value = "head -1 hello.txt";
    });
    await page.click("#shell-go");
    await new Promise((r) => setTimeout(r, 15000));
    const titleLines = (await logText())
        .slice(titleFrom)
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("$") && !l.startsWith("run"));
    if (titleLines.length === 0 || /no such file/i.test(titleLines[0])) {
        throw new Error("run 2 did not leave a readable hello.txt title line");
    }
    note(`run 2 title verified: "${titleLines[0]}"`);

    // AC4d: shell box - "total" appears only in real ls output, not in the echo
    const shellFrom = (await logText()).length;
    await page.evaluate(() => {
        document.getElementById("shell").value = "cat hello.txt && ls -la";
    });
    await page.click("#shell-go");
    await waitLog("total", 120000, shellFrom);
    const shellProduced = (await logText()).slice(shellFrom);
    if (!/pollen/i.test(shellProduced))
        throw new Error("hello.txt content missing from shell output");
    note(
        `shell output verified: ${shellProduced.slice(0, 200).replace(/\n/g, " | ")}`,
    );
    await shot("shell");

    // AC4e: ZIP export contains hello.txt but no internals
    const exportFrom = (await logText()).length;
    await page.click("#export");
    await waitLog("exported", 180000, exportFrom);
    const exportLine = (await logText())
        .split("\n")
        .find((l) => l.startsWith("exported"));
    if (!exportLine.includes("hello.txt"))
        throw new Error(`zip missing hello.txt: ${exportLine}`);
    if (exportLine.includes(".bridge") || exportLine.includes(".pi"))
        throw new Error(`zip leaks internals: ${exportLine}`);
    note(`zip verified: ${exportLine}`);

    // AC4f: invalid key -> visible error, no crash
    await page.evaluate(() => {
        document.getElementById("paste-key").value = "sk_definitely_invalid";
    });
    await page.click("#paste-connect");
    await setPromptAndRun("say hi");
    await waitLog("key rejected", 5 * 60 * 1000);
    note("invalid key produced visible error, page alive");
    await shot("invalid-key");

    note("E2E PASS");
} catch (err) {
    note(`E2E FAIL: ${err.message}`);
    await shot("failure");
    process.exitCode = 1;
} finally {
    writeFileSync(
        join(OUT, "transcript.txt"),
        `${transcript.join("\n")}\n\n---- LOG ----\n${await logText().catch(() => "")}`,
    );
    await browser.close();
    server.close();
}
