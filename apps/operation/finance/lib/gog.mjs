import { spawn } from "node:child_process";

/**
 * Thin async wrappers around the `gog` CLI. This is the ONLY module in the app
 * that shells out. Every other module is pure. Swapping this for the Google
 * Sheets googleapis client later would touch no other file.
 */

function run(args, { account, json = false } = {}) {
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
                reject(
                    new Error(
                        `gog ${finalArgs.join(" ")} exited ${code}\nstderr: ${stderr}`,
                    ),
                );
                return;
            }
            resolve(json ? JSON.parse(stdout) : stdout.trim());
        });
    });
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

export async function freeze(spreadsheetId, rows, { account }) {
    await run(["sheets", "freeze", spreadsheetId, "--rows", String(rows)], {
        account,
    });
}
