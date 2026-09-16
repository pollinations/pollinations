import { readFile } from "node:fs/promises";
import Stripe from "stripe";
import { runFraudBanCheck } from "../src/utils/stripe-fraud-ban.ts";
import { FraudCheckError } from "../src/utils/stripe-fraud-score.ts";

export function fraudCheckErrorMessage(error) {
    if (error instanceof FraudCheckError) return error.message;
    if (error instanceof Stripe.errors.StripeError) {
        const status = Number.isInteger(error.statusCode)
            ? ` (HTTP ${error.statusCode})`
            : "";
        return `Stripe request failed${status}. Check Stripe request logs; response details hidden.`;
    }
    if (error instanceof SyntaxError)
        return "Invalid JSON in credentials or D1 response; contents hidden.";
    if (error?.code === "ENOENT") return "Credentials file not found.";
    if (error?.code === "EACCES" || error?.code === "EPERM")
        return "Credentials file cannot be read: permission denied.";
    if (error?.name === "TimeoutError" || error?.name === "AbortError")
        return "Request timed out or was aborted.";
    return "Unexpected failure; details hidden to protect credentials and payment data.";
}

/** Private operators' report: one summary line plus the candidate list as a file. */
export function buildFraudReport(result, apply) {
    const mode = apply
        ? `bans applied: ${result.applied}`
        : `read-only · ${result.candidates} candidate${result.candidates === 1 ? "" : "s"}`;
    const content = `Fraud ban check · ${mode} · ${result.charges} charges scanned, ${result.unmapped} unmapped`;
    if (!result.report.length) return { content, file: null };
    const lines = result.report.map(
        (user) => `${user.score.toFixed(2)}\t${user.id}\t${user.name ?? ""}`,
    );
    return {
        content,
        file: {
            name: `fraud-candidates-${new Date().toISOString().slice(0, 10)}.tsv`,
            body: `score\tuser_id\tname\n${lines.join("\n")}\n`,
        },
    };
}

export async function postFraudReport(webhookUrl, result, apply, fetchImpl) {
    const { content, file } = buildFraudReport(result, apply);
    const form = new FormData();
    form.set(
        "payload_json",
        JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    );
    if (file)
        form.set(
            "files[0]",
            new Blob([file.body], { type: "text/tab-separated-values" }),
            file.name,
        );
    const response = await fetchImpl(webhookUrl, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
        throw new FraudCheckError(
            `Discord report failed: HTTP ${response.status}`,
        );
}

// Production-only job. These identities match Enter's production bindings.
const D1_DATABASE_ID = "fc771b05-4e24-48bf-980c-d09f21279bd1";
const CF_ACCOUNT_ID = "b6ec751c0862027ba269faf7029b2501";

async function main() {
    const secretPath = process.argv[process.argv.indexOf("--secrets-file") + 1];
    if (!process.argv.includes("--secrets-file") || !secretPath)
        throw new FraudCheckError("--secrets-file is required");
    if (
        !process.env.CLOUDFLARE_API_TOKEN ||
        process.env.CLOUDFLARE_ACCOUNT_ID !== CF_ACCOUNT_ID
    )
        throw new FraudCheckError("Expected production Cloudflare credentials");
    const { STRIPE_SECRET_KEY } = JSON.parse(
        await readFile(secretPath, "utf8"),
    );
    if (!STRIPE_SECRET_KEY)
        throw new FraudCheckError("STRIPE_SECRET_KEY is required");
    const stripe = new Stripe(STRIPE_SECRET_KEY, {
        apiVersion: "2025-12-15.clover",
        maxNetworkRetries: 3,
        timeout: 30000,
    });
    async function query(body) {
        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(60000),
            },
        );
        if (!response.ok)
            throw new FraudCheckError(
                `D1 query failed: HTTP ${response.status}`,
            );
        const data = await response.json();
        if (
            !data.success ||
            !Array.isArray(data.result) ||
            data.result.length !== (body.batch?.length ?? 1) ||
            data.result.some((page) => !page.success)
        )
            throw new FraudCheckError("D1 query failed");
        return data.result;
    }
    const apply = process.env.FRAUD_BAN_APPLY === "true";
    const result = await runFraudBanCheck(stripe, query, {
        apply,
        // Add manually restored accounts here before lifting their bans.
        excludedUserIds: (process.env.FRAUD_BAN_EXCLUDED_USER_IDS ?? "")
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean),
    });
    // Candidate identities go only to the private operators' channel.
    if (process.env.DISCORD_FRAUD_WEBHOOK_URL)
        await postFraudReport(
            process.env.DISCORD_FRAUD_WEBHOOK_URL,
            result,
            apply,
            fetch,
        );
}

if (import.meta.main) {
    main().catch((error) => {
        // Provider errors can contain payment data. Keep public logs aggregate-only.
        console.error(
            `Fraud check failed: ${fraudCheckErrorMessage(error)} No further accounts will be processed.`,
        );
        process.exitCode = 1;
    });
}
