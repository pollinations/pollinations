import { readFile } from "node:fs/promises";
import Stripe from "stripe";
import { runFraudBanCheck } from "../src/utils/stripe-fraud-ban.ts";
import {
    FRAUD_BAN_THRESHOLD,
    FraudCheckError,
} from "../src/utils/stripe-fraud-score.ts";

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

/** Match current Stripe state against the atomic refund ledger; never change money. */
export async function collectRefundReport(stripe, query, until, since) {
    if (!Number.isSafeInteger(since) || since <= 0 || since > until)
        throw new FraudCheckError(
            "Refund ledger start time is not configured correctly",
        );
    const refunds = [];
    for await (const refund of stripe.refunds.list({
        limit: 100,
        created: { gte: since, lte: until },
    }))
        refunds.push(refund);
    if (refunds.length) {
        const [schema] = await query({
            sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'stripe_refund'",
            params: [],
        });
        if (!Array.isArray(schema?.results))
            throw new FraudCheckError("Invalid refund ledger schema response");
        if (!schema.results.length)
            throw new FraudCheckError("Refund ledger is not deployed");
    }
    const ledger = new Map();
    for (let i = 0; i < refunds.length; i += 100) {
        const ids = refunds.slice(i, i + 100).map((refund) => refund.id);
        const [page] = await query({
            sql: `SELECT refund_id, status, charge_id, amount, currency, pollen_reversed FROM stripe_refund WHERE refund_id IN (${ids.map(() => "?").join(",")})`,
            params: ids,
        });
        if (!Array.isArray(page?.results))
            throw new FraudCheckError("Invalid refund ledger page");
        for (const row of page.results) ledger.set(row.refund_id, row);
    }
    return refunds.map((refund) => {
        const row = ledger.get(refund.id);
        const chargeId =
            typeof refund.charge === "string"
                ? refund.charge
                : refund.charge?.id;
        const terminal = ["succeeded", "failed", "canceled"].includes(
            refund.status,
        );
        const matched =
            row &&
            row.status === refund.status &&
            row.charge_id === chargeId &&
            row.amount === refund.amount &&
            row.currency === refund.currency &&
            Number.isFinite(row.pollen_reversed) &&
            row.pollen_reversed >= 0;
        return {
            id: refund.id,
            chargeId,
            created: refund.created,
            amount: refund.amount,
            currency: refund.currency,
            status: refund.status,
            pollen: matched ? row.pollen_reversed : null,
            issue:
                terminal && !matched
                    ? "Pollen adjustment unverified"
                    : !terminal && row?.status === "succeeded"
                      ? "Pollen deducted; refund not complete"
                      : null,
        };
    });
}

/** Collect pending work; scans and reconciliation never change accounts or money. */
export async function collectDailyEvidence(
    stripe,
    query,
    excludedUserIds = [],
    now = Date.now(),
    refundLedgerStartSeconds,
) {
    let requests = 0;
    const count = () => {
        requests++;
    };
    stripe.on("request", count);
    const started = Date.now();
    const evidence = { at: new Date(now).toISOString(), errors: [] };
    const select = (rows) => ({ total: rows.length, shown: rows.slice(0, 3) });
    try {
        const scan = await runFraudBanCheck(stripe, query, {
            apply: false,
            excludedUserIds,
        });
        evidence.charges = scan.charges;
        evidence.unmapped = scan.unmapped;
        evidence.banThreshold = FRAUD_BAN_THRESHOLD;
        evidence.fraudReview = select(
            scan.report.map(
                ({ id, github_username, score, breakdown, payments }) => ({
                    id,
                    label: github_username || id,
                    score,
                    breakdown,
                    paymentId: payments[0]?.id,
                }),
            ),
        );
        const groups = new Map();
        let disputeCount = 0;
        for (const d of scan.disputes) {
            if (
                !["needs_response", "warning_needs_response"].includes(d.status)
            )
                continue;
            const key = `${d.due}:${d.currency}`;
            const group = groups.get(key) ?? {
                due: d.due,
                currency: d.currency,
                amount: 0,
                count: 0,
            };
            group.amount += d.amount;
            group.count++;
            disputeCount++;
            groups.set(key, group);
        }
        evidence.disputes = {
            total: disputeCount,
            shown: [...groups.values()]
                .sort(
                    (a, b) =>
                        (a.due ?? Infinity) - (b.due ?? Infinity) ||
                        a.currency.localeCompare(b.currency),
                )
                .slice(0, 3),
        };
    } catch (error) {
        evidence.errors.push(
            `Account/dispute scan: ${fraudCheckErrorMessage(error)}`,
        );
    }
    // A failed account scan must not prevent independent refund checks.
    try {
        const refunds = await collectRefundReport(
            stripe,
            query,
            Math.floor(now / 1000),
            refundLedgerStartSeconds,
        );
        evidence.refunds = select(
            refunds
                .filter((r) => r.issue)
                .sort((a, b) => a.created - b.created),
        );
    } catch (error) {
        evidence.errors.push(
            `Refund reconciliation: ${fraudCheckErrorMessage(error)}`,
        );
    }
    stripe.off("request", count);
    evidence.health = {
        complete: evidence.errors.length === 0,
        stripeRequests: requests,
        seconds: Math.round((Date.now() - started) / 1000),
    };
    return evidence;
}

function money(amount, currency) {
    const code = currency.toUpperCase();
    const format = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: code,
    });
    // Stripe retains two-decimal API amounts for ISK and UGX.
    const decimals = ["ISK", "UGX"].includes(code)
        ? 2
        : format.resolvedOptions().maximumFractionDigits;
    return format.format(amount / 10 ** decimals);
}

const stripeLink = (kind, id, label) =>
    `[${label}](https://dashboard.stripe.com/${kind}/${encodeURIComponent(id)})`;
const signalNames = {
    fd: "fraud dispute",
    ew: "issuer warning",
    fraud: "fraud report",
    hr: "high-risk payment",
};

/** Facts, ordering, amounts and counts are rendered directly, never rewritten by a model. */
export function formatDailyReport(evidence) {
    const date = new Date(evidence.at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
    });
    const footer = "_Manual review only. No actions performed._";
    const render = (limit) => {
        const sections = [`**🐝 Polli-ce · ${date}**`];
        const section = (title, group, row, count = () => 1) => {
            if (!group?.total) return;
            const shown = group.shown.slice(0, limit);
            const remaining =
                group.total - shown.reduce((sum, item) => sum + count(item), 0);
            sections.push(
                `**${title} · ${group.total}**\n${shown.map(row).join("\n")}${remaining ? `\n+${remaining} more awaiting review` : ""}`,
            );
        };
        section(
            "📋 Disputes to handle",
            evidence.disputes,
            (d) => {
                const deadline = d.due
                    ? `${new Date(d.due * 1000).toLocaleString("en-GB", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: "UTC",
                      })} UTC`
                    : "deadline unavailable";
                const urgent =
                    d.due &&
                    d.due * 1000 - Date.parse(evidence.at) <= 2 * 86400_000;
                return `• ${urgent ? "🚨 " : ""}**${d.count} dispute${d.count === 1 ? "" : "s"} · ${money(d.amount, d.currency)} ${d.currency.toUpperCase()}** — ${d.due ? "respond by " : ""}**${deadline}** → [Review disputes](https://dashboard.stripe.com/disputes)`;
            },
            (d) => d.count,
        );
        section("👀 Accounts to review", evidence.fraudReview, (u) => {
            const label =
                u.label.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || u.id;
            const reasons = u.breakdown
                .filter((b) => b.count)
                .map(
                    (b) =>
                        `${b.count} ${signalNames[b.signal]}${b.count === 1 ? "" : "s"}`,
                )
                .join(", ");
            const action =
                u.score >= evidence.banThreshold
                    ? "Consider banning after review"
                    : "Review evidence";
            const link = u.paymentId
                ? stripeLink("payments", u.paymentId, action)
                : action;
            return `• **${label} · ${u.score.toFixed(2)}** — ${reasons}. → ${link}`;
        });
        section(
            "💸 Refunds to reconcile",
            evidence.refunds,
            (r) =>
                `• **${money(r.amount, r.currency)}** · ${r.status} — ${r.issue}. **Check balance adjustment** → ${stripeLink("payments", r.chargeId, "Open payment")}`,
        );
        const blocked = [];
        if (!evidence.disputes || !evidence.fraudReview)
            blocked.push(
                "• Account/dispute checks unavailable → Review Stripe and check the report job.",
            );
        if (!evidence.refunds)
            blocked.push(
                evidence.errors.some((e) =>
                    e.includes("Refund ledger is not deployed"),
                )
                    ? "• Refund checks unavailable → Deploy the refund ledger, then rerun."
                    : evidence.errors.some((e) =>
                            e.includes("Refund ledger start time"),
                        )
                      ? "• Refund checks unavailable → Set the report’s refund start time to the production ledger activation time."
                      : "• Refund checks unavailable → Check the report job and rerun.",
            );
        if (blocked.length)
            sections.push(`**🔧 Blocked checks**\n${blocked.join("\n")}`);
        if (sections.length === 1)
            sections.push("Nothing needs attention in the checked data.");
        sections.push(footer);
        return sections.join("\n\n");
    };
    // Preserve complete rows and accurate omitted counts within Discord's limit.
    for (let limit = 3; limit >= 0; limit--) {
        const message = render(limit);
        if (message.length <= 2000) return message;
    }
    throw new FraudCheckError("Report exceeds Discord message limit");
}

export async function postFraudReport(webhookUrl, content, fetchImpl = fetch) {
    const url = new URL(webhookUrl);
    url.searchParams.set("wait", "true");
    const response = await fetchImpl(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            content,
            flags: 4,
            allowed_mentions: { parse: [] },
        }),
        signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
        throw new FraudCheckError(
            `Discord report failed: HTTP ${response.status}`,
        );
}

export async function runDailyReport({
    stripe,
    query,
    webhookUrl,
    excludedUserIds = [],
    fetchImpl = fetch,
    now = Date.now(),
    refundLedgerStartSeconds,
}) {
    const evidence = await collectDailyEvidence(
        stripe,
        query,
        excludedUserIds,
        now,
        refundLedgerStartSeconds,
    );
    console.log(
        JSON.stringify({ health: evidence.health, errors: evidence.errors }),
    );
    await postFraudReport(webhookUrl, formatDailyReport(evidence), fetchImpl);
    return evidence.health.complete;
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
    const complete = await runDailyReport({
        stripe,
        query,
        webhookUrl,
        refundLedgerStartSeconds: Number(
            process.env.STRIPE_REFUND_LEDGER_START_SECONDS,
        ),
        excludedUserIds: (process.env.FRAUD_BAN_EXCLUDED_USER_IDS ?? "")
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean),
    });
    if (!complete) process.exitCode = 1;
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
