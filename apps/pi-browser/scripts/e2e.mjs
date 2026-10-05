#!/usr/bin/env node
/**
 * Real end-to-end run of the app, for the kind of evidence a reviewer wants:
 * system Chrome (Wasm exception handling is required), a Pollinations model,
 * Pi writing a file and running a command inside the sandbox, with every
 * model call leaving through the fetch bridge.
 *
 *   POLLEN_KEY=sk_... node scripts/e2e.mjs ["prompt"]
 *
 * Requires the dev server (`npm run dev`) on port 5173 and a key with Pollen
 * (https://enter.pollinations.ai/keys). Writes evidence/e2e-run.md.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PI_BROWSER_URL ?? "http://localhost:5173/";
const KEY = process.env.POLLEN_KEY ?? "";
const MODEL = process.env.PI_MODEL ?? "openai/gpt-5.4-nano";
const TIMEOUT_MS = Number(process.env.PI_E2E_TIMEOUT_MS ?? 480_000);
const PROMPT =
    process.argv[2] ??
    "Create a file hello.txt containing the single word bridge-ok, then run `cat hello.txt` and show me the output.";

if (!KEY) {
    console.log(
        "POLLEN_KEY not set — running against the public guest tier (no key).",
    );
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
});

// Probes that spawn guest commands are omitted on purpose: spawning `node`
// alongside Pi's own process crashed the Wasmer worker (fd TypeError), which
// killed the whole sandbox. Everything below reads the filesystem only; the
// guest-side proof lives in /workspace/.bridge/loaded.txt (NODE_OPTIONS +
// shim version), which the bridgeDir probe surfaces.

const readState = () =>
    page.evaluate(async () => {
        const session = window.__piBrowser?.session;
        const probe = async (label, fn) => {
            try {
                return await fn();
            } catch (error) {
                return `${label}: ${String(error?.message ?? error)}`;
            }
        };
        return {
            isolated: window.crossOriginIsolated,
            auth: document.getElementById("auth-pill")?.textContent,
            models: document.getElementById("model")?.options.length,
            term: (
                document.querySelector(".xterm-rows")?.innerText ?? ""
            ).trim(),
            log: document.getElementById("log")?.innerText.trim(),
            files: document.getElementById("files")?.innerText.trim(),
            running: Boolean(session),
            bridgeDir: await probe("bridgeDir", async () => {
                const fs = session?.sandbox?.fs;
                if (!fs) return "no sandbox";
                const list = async (path) => {
                    try {
                        return (await fs.readDir(path))
                            .map((entry) =>
                                typeof entry === "string" ? entry : entry.name,
                            )
                            .join(",");
                    } catch (error) {
                        return `missing(${String(error?.message ?? error)})`;
                    }
                };
                const pending = await list("/workspace/.bridge/pending");
                const done = await list("/workspace/.bridge/done");
                const cat = async (path) => {
                    try {
                        return (await fs.readText(path)).slice(0, 400);
                    } catch (error) {
                        return `missing(${String(error?.message ?? error)})`;
                    }
                };
                const loaded = await cat("/workspace/.bridge/loaded.txt");
                const guestError = await cat("/workspace/.bridge/error.txt");
                const guestCalls = await cat("/workspace/.bridge/calls.log");
                const workspace = await list("/workspace");
                const result = `pending=[${pending}] done=[${done}] loaded=${loaded} guestError=${guestError} calls=${guestCalls} workspace=[${workspace}]`;
                let sample = "";
                if (pending) {
                    const first = pending.split(",")[0];
                    try {
                        sample = (
                            await fs.readText(
                                `/workspace/.bridge/pending/${first}`,
                            )
                        ).slice(0, 300);
                    } catch (error) {
                        sample = String(error?.message ?? error);
                    }
                }
                return `${result} sample=${sample}`;
            }),
            guestEnv: "omitted (spawning guest commands crashed the worker)",
        };
    });

try {
    // The app auto-types the prompt on a fixed timer; that occasionally lost
    // its Enter. Opt out and drive the terminal ourselves (proven in diag).
    const url = BASE.includes("?")
        ? `${BASE}&noautotype=1`
        : `${BASE}?noautotype=1`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    // <option> is never "visible"; attached is enough to know the catalog loaded.
    await page.waitForSelector("#model option", {
        state: "attached",
        timeout: 30_000,
    });

    if (KEY) {
        await page.fill("#key", KEY);
        await page.press("#key", "Enter");
    } else {
        // A key from an earlier run must not leak into the guest tier run.
        await page.evaluate(() => {
            for (const k of Object.keys(localStorage)) {
                if (/token|key|pollen|auth/i.test(k))
                    localStorage.removeItem(k);
            }
            window.__piBrowser?.forget?.();
        });
    }
    await page.selectOption("#model", MODEL);
    await page.fill("#prompt", PROMPT);
    await page.click("#run");

    // Wait for Pi's own UI, then type the prompt into the real terminal and
    // press Enter — the same path a human uses.
    await page.waitForFunction(
        () =>
            (document.querySelector(".xterm-rows")?.innerText ?? "").includes(
                "escape interrupt",
            ),
        undefined,
        { timeout: 90_000 },
    );
    await page.click(".xterm-screen");
    await page.keyboard.type(PROMPT);
    await page.keyboard.press("Enter");

    const started = Date.now();
    let state = await readState();
    console.log(`running with ${MODEL} on ${BASE}`);

    // No spawned probes here: they killed the worker in earlier runs. The
    // guest-side proof (shim loaded, NODE_OPTIONS set) comes from
    // /workspace/.bridge/loaded.txt via the bridgeDir probe instead.
    const selfTest = "omitted — see loaded.txt in Bridge queue";
    console.log(`self-test: ${selfTest}`);
    while (Date.now() - started < TIMEOUT_MS) {
        await page.waitForTimeout(5000);
        state = await readState();
        const bridged = (state.log.match(/^\d+ POST/gm) ?? []).length;
        const hasFile = /hello\.txt/.test(state.files ?? "");
        process.stdout.write(
            `. bridged=${bridged} file=${hasFile} running=${state.running}\n`,
        );
        if (bridged >= 1 && hasFile) break;
        if (!state.running && bridged >= 1) break;
    }

    await page.waitForTimeout(4000);
    state = await readState();

    const stamp = new Date().toISOString();
    const evidence = [
        "# Pi in the browser — end-to-end run",
        "",
        `- Date: ${stamp}`,
        `- Browser: ${await page.evaluate(() => navigator.userAgent)}`,
        `- Page: ${BASE} (cross-origin isolated: ${state.isolated})`,
        `- Model: ${MODEL}`,
        `- Prompt: ${PROMPT}`,
        `- Model calls bridged: ${(state.log.match(/^\d+ POST/gm) ?? []).length}`,
        `- Bridge self-test: ${selfTest}`,
        `- Bridge queue: ${state.bridgeDir}`,
        `- Guest env: ${state.guestEnv}`,
        "",
        "## Terminal",
        "",
        "```text",
        state.term,
        "```",
        "",
        "## Model calls through the bridge",
        "",
        "```text",
        state.log,
        "```",
        "",
        "## Files in /workspace",
        "",
        "```text",
        state.files,
        "```",
        "",
        consoleErrors.length
            ? `## Console errors\n\n\`\`\`text\n${consoleErrors.join("\n")}\n\`\`\`\n`
            : "",
    ].join("\n");

    const out = join(HERE, "..", "evidence", "e2e-run.md");
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, evidence, "utf8");
    console.log(`\nwrote ${out}`);

    const bridged = (state.log.match(/^\d+ POST/gm) ?? []).length;
    if (bridged < 1) {
        console.error("no model call left the sandbox — failing");
        process.exitCode = 1;
    }
} finally {
    await browser.close();
}
