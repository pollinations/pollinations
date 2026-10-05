#!/usr/bin/env node
/** Quick diagnostic: start Pi, send the prompt, dump terminal + bridge state. */
import { chromium } from "playwright-core";

const BASE = process.env.PI_BROWSER_URL ?? "http://localhost:5173/";
const KEY = process.env.POLLEN_KEY ?? "";
const MODEL = process.env.PI_MODEL ?? "openai/gpt-5.4-nano";
const PROMPT =
    process.argv[2] ??
    "Create a file hello.txt containing the single word bridge-ok, then run `cat hello.txt` and show me the output.";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
try {
    await page.goto(`${BASE}${BASE.includes("?") ? "&" : "?"}noautotype=1`, {
        waitUntil: "domcontentloaded",
    });
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
    console.log("prompt sent; waiting 60s…");
    await page.waitForTimeout(60_000);

    const state = await page.evaluate(async () => {
        const session = window.__piBrowser?.session;
        const fs = session?.sandbox?.fs;
        const out = {};
        out.term = (
            document.querySelector(".xterm-rows")?.innerText ?? ""
        ).trim();
        out.log = document.getElementById("log")?.innerText.trim();
        out.files = document.getElementById("files")?.innerText.trim();
        if (fs) {
            const list = async (p) => {
                try {
                    return (await fs.readDir(p)).map((e) =>
                        typeof e === "string" ? e : e.name,
                    );
                } catch (e) {
                    return `missing(${e.message})`;
                }
            };
            out.pending = await list("/workspace/.bridge/pending");
            out.done = await list("/workspace/.bridge/done");
            out.workspace = await list("/workspace");
            const cat = async (p) => {
                try {
                    return (await fs.readText(p)).slice(0, 800);
                } catch {
                    return null;
                }
            };
            out.loaded = await cat("/workspace/.bridge/loaded.txt");
            out.error = await cat("/workspace/.bridge/error.txt");
            out.calls = await cat("/workspace/.bridge/calls.log");
        } else {
            out.noSandbox = true;
        }
        return out;
    });
    console.log(JSON.stringify(state, null, 2));
    console.log("--- console ---");
    console.log(logs.slice(-30).join("\n"));
} finally {
    await browser.close();
}
