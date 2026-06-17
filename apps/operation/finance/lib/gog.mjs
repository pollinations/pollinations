import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

/**
 * Thin async wrappers around the `gog` CLI. This is the ONLY module in the app
 * that shells out. Every other module is pure. Swapping this for the Google
 * Sheets googleapis client later would touch no other file.
 *
 * Rate limit handling: Google Sheets API enforces per-minute read/write quotas.
 * A full rebuild makes ~50 API calls. When running two rebuilds in quick
 * succession we hit 429. runOnce() does the raw spawn; run() wraps it in
 * exponential backoff so transient rate limits are transparently retried.
 */

const RETRY_DELAYS_MS = [2000, 5000, 15000, 30000, 60000];

function runOnce(args, { account, json = false } = {}) {
    return new Promise((resolve, reject) => {
        const finalArgs = ["-a", account, ...args];
        if (json) finalArgs.push("-j");
        const child = spawn("gog", finalArgs, {
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d) => {
            stdout += d;
        });
        child.stderr.on("data", (d) => {
            stderr += d;
        });
        child.on("error", reject);
        child.on("close", (code) => {
            if (code !== 0) {
                const err = new Error(
                    `gog ${finalArgs.join(" ")} exited ${code}\nstderr: ${stderr}`,
                );
                err.stderr = stderr;
                err.exitCode = code;
                reject(err);
                return;
            }
            resolve(json ? JSON.parse(stdout) : stdout.trim());
        });
    });
}

async function run(args, opts = {}) {
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        try {
            return await runOnce(args, opts);
        } catch (err) {
            const isRateLimit = /429|rateLimitExceeded|Quota exceeded/i.test(
                err.stderr ?? err.message ?? "",
            );
            const canRetry = isRateLimit && attempt < RETRY_DELAYS_MS.length;
            if (!canRetry) throw err;
            const delay = RETRY_DELAYS_MS[attempt];
            console.error(
                `  rate-limited, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${RETRY_DELAYS_MS.length})`,
            );
            await sleep(delay);
        }
    }
    // unreachable
    throw new Error("run: exhausted retries");
}

export async function createSheet(title, { account }) {
    const r = await run(["sheets", "create", title], { account, json: true });
    return r.spreadsheetId;
}

export async function clearSheet(spreadsheetId, range, { account }) {
    await run(["sheets", "clear", spreadsheetId, range], { account });
}

export async function updateValues(spreadsheetId, range, cells, { account }) {
    await run(
        [
            "sheets",
            "update",
            spreadsheetId,
            range,
            "--values-json",
            JSON.stringify(cells),
        ],
        { account },
    );
}

export async function applyFormat(
    spreadsheetId,
    { range, format, fields },
    { account },
) {
    await run(
        [
            "sheets",
            "format",
            spreadsheetId,
            range,
            "--format-fields",
            fields,
            "--format-json",
            JSON.stringify(format),
        ],
        { account },
    );
}

export async function applyNumberFormat(
    spreadsheetId,
    range,
    pattern,
    { account },
) {
    await run(
        [
            "sheets",
            "number-format",
            spreadsheetId,
            range,
            "--pattern",
            pattern,
            "--type",
            "NUMBER",
        ],
        { account },
    );
}

export async function resizeColumn(
    spreadsheetId,
    colA1Range,
    pixels,
    { account },
) {
    await run(
        [
            "sheets",
            "resize-columns",
            spreadsheetId,
            colA1Range,
            "--width",
            String(pixels),
        ],
        {
            account,
        },
    );
}

export async function freeze(spreadsheetId, rows, { account, sheet } = {}) {
    const args = ["sheets", "freeze", spreadsheetId, "--rows", String(rows)];
    if (sheet) args.push("--sheet", sheet);
    await run(args, { account });
}

export async function listTabs(spreadsheetId, { account }) {
    const meta = await run(["sheets", "metadata", spreadsheetId], {
        account,
        json: true,
    });
    const sheets = meta?.sheets ?? [];
    return sheets.map((s) => s?.properties?.title).filter(Boolean);
}

export async function addTab(spreadsheetId, tabName, { account }) {
    await run(["sheets", "add-tab", spreadsheetId, tabName], { account });
}

export async function ensureTab(spreadsheetId, tabName, { account }) {
    const existing = await listTabs(spreadsheetId, { account });
    if (existing.includes(tabName)) return false;
    await addTab(spreadsheetId, tabName, { account });
    return true;
}
