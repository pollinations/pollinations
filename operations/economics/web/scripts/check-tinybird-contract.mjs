import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
    parsePrivateConfig,
    REQUIRED_PIPES,
    validatePipeRows,
} from "../src/lib/pipeContracts.ts";

export { REQUIRED_PIPES } from "../src/lib/pipeContracts.ts";

export async function checkTinybirdContract({
    api,
    token,
    pollenPipe = "economics_pollen_usage_api",
    fetchImpl = fetch,
}) {
    if (
        ![
            "economics_pollen_usage_api",
            "economics_pollen_usage_snapshot_api",
        ].includes(pollenPipe)
    ) {
        throw new Error("Unsupported Pollen endpoint");
    }
    const failures = [];
    for (const pipe of REQUIRED_PIPES) {
        const endpoint =
            pipe === "economics_pollen_usage_api" ? pollenPipe : pipe;
        let response;
        try {
            response = await fetchImpl(`${api}/v0/pipes/${endpoint}.json`, {
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(30_000),
            });
        } catch {
            failures.push(`${pipe}: request failed`);
            continue;
        }
        if (!response.ok) {
            failures.push(`${pipe}: HTTP ${response.status}`);
            continue;
        }
        let body;
        try {
            body = await response.json();
        } catch {
            failures.push(`${pipe}: invalid JSON`);
            continue;
        }
        if (!Array.isArray(body?.data)) {
            failures.push(`${pipe}: invalid shape`);
            continue;
        }
        if (body.data.length === 0) {
            failures.push(`${pipe}: no rows`);
            continue;
        }
        try {
            validatePipeRows(pipe, body.data);
            if (pipe === "economics_private_config_api")
                parsePrivateConfig(body.data[0]);
        } catch (error) {
            // Shared validators report field names only, never source payloads.
            failures.push(error.message);
        }
    }
    if (failures.length) {
        throw new Error(
            `Economics Tinybird contract is not ready: ${failures.join("; ")}`,
        );
    }
}

async function main() {
    const { values } = parseArgs({
        options: {
            "secrets-file": { type: "string" },
            "pollen-pipe": { type: "string" },
        },
    });
    if (!values["secrets-file"]) throw new Error("--secrets-file is required");
    const secrets = JSON.parse(await readFile(values["secrets-file"], "utf8"));
    const token = secrets.TINYBIRD_ECONOMICS_READ_TOKEN;
    if (!token) throw new Error("Tinybird read token unavailable");
    await checkTinybirdContract({
        api: "https://api.europe-west2.gcp.tinybird.co",
        token,
        pollenPipe: values["pollen-pipe"],
    });
    console.log("Economics Tinybird read contract is ready.");
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    await main();
}
