import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { gunzipSync, gzipSync } from "node:zlib";
import { dayKey } from "./analyze.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const RESERVATION = 0.1222; // Ten minutes of VM compute + 0.1 Pollen assessment.
const STATE_FILE =
    /^(snapshot-\d{4}-\d{2}-\d{2}\.json|pending\.json|notified\.json|pilot\.json|report\.(json|html)|verification\.json)$/;

export function recordCompletion(pilot, report) {
    if (!["complete", "not_needed"].includes(report.assessment.status))
        throw new Error("Assessment incomplete; source evidence saved");
    pilot.days = [...new Set([...pilot.days, dayKey(report.at)])];
    pilot.status = "observing";
}

export function pilotDecision(pilot, at = new Date().toISOString()) {
    const today = dayKey(at);
    if (pilot?.days?.includes(today)) return "already_recorded";
    if (pilot?.startedDay) {
        const days =
            (Date.parse(today) - Date.parse(pilot.startedDay)) / 86400_000;
        if (!Number.isFinite(days) || days < 0)
            throw new Error("Invalid pilot start date");
        if (days >= 14) return "observation_window_finished";
    }
    if (Number(pilot?.spentPollen ?? 0) + RESERVATION > 2)
        return "pilot_budget_exhausted";
    return "run";
}

export async function stateFiles(data) {
    const names = (await readdir(data)).filter((name) => STATE_FILE.test(name));
    const retained = new Set(
        names
            .filter((name) => name.startsWith("snapshot-"))
            .sort()
            .slice(-14),
    );
    const files = {};
    for (const name of names) {
        if (name.startsWith("snapshot-") && !retained.has(name)) continue;
        files[name] = await readFile(join(data, name), "utf8");
    }
    return files;
}

export async function seal(data, output) {
    const files = await stateFiles(data);
    if (!Object.keys(files).length) throw new Error("No state to preserve");
    const metadata = JSON.parse(
        await readFile(join(HERE, "secrets/prod.vars.json"), "utf8"),
    );
    const recipients = metadata.sops.age.map((key) => key.recipient).join(",");
    const encrypted = execFileSync(
        "sops",
        [
            "encrypt",
            "--age",
            recipients,
            "--input-type",
            "json",
            "--output-type",
            "json",
            "--filename-override",
            "operations/model-manager/data/state.vars.json",
        ],
        {
            input: JSON.stringify({
                payload: gzipSync(
                    JSON.stringify({ version: 1, files }),
                ).toString("base64"),
            }),
            stdio: ["pipe", "pipe", "pipe"],
            maxBuffer: 128 * 1024 * 1024,
        },
    );
    await mkdir(dirname(output), { recursive: true, mode: 0o700 });
    await writeFile(output, encrypted, { mode: 0o600 });
}

export async function restore(input, data) {
    const decrypted = execFileSync("sops", ["decrypt", input], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 128 * 1024 * 1024,
    });
    const state = JSON.parse(
        gunzipSync(Buffer.from(JSON.parse(decrypted).payload, "base64"), {
            maxOutputLength: 256 * 1024 * 1024,
        }).toString("utf8"),
    );
    if (state.version !== 1 || !state.files || typeof state.files !== "object")
        throw new Error("Unsupported saved state");
    const entries = Object.entries(state.files);
    for (const [name, content] of entries)
        if (!STATE_FILE.test(name) || typeof content !== "string")
            throw new Error("Invalid saved state file");
    await mkdir(data, { recursive: true, mode: 0o700 });
    for (const [name, content] of entries)
        await writeFile(join(data, name), content, { mode: 0o600, flag: "wx" });
}

if (
    process.argv[1] &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    const { positionals, values } = parseArgs({
        allowPositionals: true,
        options: {
            data: { type: "string", default: join(HERE, "data") },
            file: { type: "string" },
        },
    });
    try {
        const data = resolve(values.data);
        if (positionals[0] === "seal") await seal(data, resolve(values.file));
        else if (positionals[0] === "restore")
            await restore(resolve(values.file), data);
        else throw new Error("Expected seal or restore");
    } catch {
        // CLI errors can contain decrypted subprocess buffers; never dump them.
        console.error(
            "Model manager state operation failed; no fresh pilot started.",
        );
        process.exitCode = 1;
    }
}
