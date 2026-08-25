import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const apiKey = process.env.INFERENCEPORT_API_KEY;
if (!apiKey) throw new Error("INFERENCEPORT_API_KEY is missing");

const apiBase = (
    process.env.INFERENCEPORT_API_BASE ?? "https://api.inferenceport.ai/v1"
).replace(/\/$/, "");
const outputArgument = process.argv[2];
const collectedAt = new Date().toISOString();
const outputPath = resolve(
    outputArgument ??
        `operations/economics/ingest/data/inbox/inferenceport/balance-${collectedAt.slice(0, 10)}.json`,
);

async function request(path) {
    const url = `${apiBase}${path}`;
    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
        throw new Error(
            `InferencePort ${path} failed with HTTP ${response.status}`,
        );
    }
    return response.json();
}

const [account, creditLedger] = await Promise.all([
    request("/me"),
    request("/credits/ledger?limit=500"),
]);

const balance = Number(account?.wallet?.balance_credits);
if (!Number.isFinite(balance)) {
    throw new Error("InferencePort /me returned no numeric wallet balance");
}

const payload = {
    collected_at: collectedAt,
    provider: "inferenceport",
    console_url: "https://console.inferenceport.ai",
    api_source: `${apiBase}/me`,
    account,
    credit_ledger: creditLedger,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);

process.stdout.write(
    `${JSON.stringify({
        output: outputPath,
        collected_at: collectedAt,
        balance_credits: balance,
        ledger_entries: Array.isArray(creditLedger?.entries)
            ? creditLedger.entries.length
            : 0,
    })}\n`,
);
