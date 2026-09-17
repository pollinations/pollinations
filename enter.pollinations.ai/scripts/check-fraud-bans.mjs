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

const OPEN_DISPUTE = ["needs_response", "warning_needs_response"];
const ROWS = 5;

/** Disputes still awaiting our response. Stripe gives at most ~3 weeks to answer. */
export async function listOpenDisputes(stripe, now = Date.now()) {
    const open = [];
    for await (const dispute of stripe.disputes.list({
        limit: 100,
        created: { gte: Math.floor(now / 1000) - 30 * 86400 },
    })) {
        if (OPEN_DISPUTE.includes(dispute.status)) open.push(dispute);
    }
    return open;
}

const money = (amount, currency) =>
    new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency.toUpperCase(),
    }).format(amount / 100);

const more = (rows) =>
    rows.length > ROWS ? `\n+${rows.length - ROWS} more` : "";

/** Private operators' report; null when nothing needs attention. */
export function formatDailyReport({ accounts, disputes }) {
    const sections = [];
    if (disputes.length) {
        const totals = new Map();
        for (const d of disputes)
            totals.set(d.currency, (totals.get(d.currency) ?? 0) + d.amount);
        const due = Math.min(
            ...disputes.map((d) => d.evidence_details?.due_by ?? Infinity),
        );
        const deadline = Number.isFinite(due)
            ? ` · first due ${new Date(due * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`
            : "";
        sections.push(
            `**Disputes to answer · ${disputes.length}** (${[...totals].map(([c, a]) => money(a, c)).join(", ")})${deadline} → <https://dashboard.stripe.com/disputes>`,
        );
    }
    if (accounts.length) {
        const rows = accounts.slice(0, ROWS).map((a) => {
            const label = `${a.github_username ?? a.id} · ${a.score.toFixed(2)}`;
            return a.customerId
                ? `• ${label} → <https://dashboard.stripe.com/customers/${a.customerId}>`
                : `• ${label}`;
        });
        sections.push(
            `**Accounts to review · ${accounts.length}**\n${rows.join("\n")}${more(accounts)}`,
        );
    }
    if (!sections.length) return null;
    return `**Daily Stripe report**\n\n${sections.join("\n\n")}\n\n_Manual review only. No actions performed._`;
}

export async function postFraudReport(webhookUrl, content, fetchImpl = fetch) {
    const response = await fetchImpl(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
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
    const webhookUrl = process.env.DISCORD_FRAUD_WEBHOOK_URL;
    if (!webhookUrl)
        throw new FraudCheckError("Discord report webhook is not configured");
    const scan = await runFraudBanCheck(stripe, query, {
        // Add manually restored accounts here before lifting their bans.
        excludedUserIds: (process.env.FRAUD_BAN_EXCLUDED_USER_IDS ?? "")
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean),
    });
    const report = formatDailyReport({
        accounts: scan.report,
        disputes: await listOpenDisputes(stripe),
    });
    // Account identities go only to the private operators' channel.
    if (report) await postFraudReport(webhookUrl, report);
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
