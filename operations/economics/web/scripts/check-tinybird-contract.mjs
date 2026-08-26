import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const REQUIRED_PIPES = [
    "economics_bank_ledger_api",
    "economics_compute_ledger_api",
    "economics_pollen_usage_api",
    "economics_private_config_api",
];

export async function checkTinybirdContract({ api, token, fetchImpl = fetch }) {
    const failures = [];
    for (const pipe of REQUIRED_PIPES) {
        const response = await fetchImpl(`${api}/v0/pipes/${pipe}.json`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
            failures.push(`${pipe}: HTTP ${response.status}`);
            continue;
        }
        const body = await response.json();
        if (!Array.isArray(body.data)) failures.push(`${pipe}: invalid shape`);
    }
    if (failures.length) {
        throw new Error(
            `Economics Tinybird contract is not ready: ${failures.join("; ")}`,
        );
    }
}

async function main() {
    const { values } = parseArgs({
        options: { "secrets-file": { type: "string" } },
    });
    if (!values["secrets-file"]) throw new Error("--secrets-file is required");
    const secrets = JSON.parse(await readFile(values["secrets-file"], "utf8"));
    const token = secrets.TINYBIRD_ECONOMICS_READ_TOKEN;
    if (!token) throw new Error("Tinybird read token unavailable");
    await checkTinybirdContract({
        api: "https://api.europe-west2.gcp.tinybird.co",
        token,
    });
    console.log("Economics Tinybird production contract is ready.");
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    await main();
}
