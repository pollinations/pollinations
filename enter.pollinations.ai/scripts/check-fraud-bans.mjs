import { readFile } from "node:fs/promises";
import Stripe from "stripe";
import { runFraudBanCheck } from "../src/utils/stripe-fraud-ban.ts";
import {
    FRAUD_SCAN_START_SECONDS,
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

const needsResponse = (dispute) =>
    ["needs_response", "warning_needs_response"].includes(dispute.status);
const labels = {
    fd: "fraud disputes",
    ew: "issuer warnings",
    fraud: "fraud reports",
    hr: "Radar risk",
};
const link = (kind, id) =>
    `[${id}](https://dashboard.stripe.com/${kind}/${encodeURIComponent(id)})`;
const text = (value) =>
    String(value ?? "")
        .replace(/[\\`*_~|<>[\]@\r\n]/g, " ")
        .slice(0, 50);
const date = (seconds) =>
    seconds
        ? new Date(seconds * 1000).toISOString().slice(0, 10)
        : "unknown date";
// Stripe's presentment currencies use ISO exponents except ISK and UGX.
const money = (amount, currency) => {
    if (!Number.isFinite(amount) || !currency) return "amount unavailable";
    const format = new Intl.NumberFormat("en", { style: "currency", currency });
    const digits = ["isk", "ugx"].includes(currency)
        ? 2
        : format.resolvedOptions().maximumFractionDigits;
    return format.format(amount / 10 ** digits);
};
const shortList = (rows, render, empty) => {
    const lines = [];
    for (const row of rows.slice(0, 3)) {
        const line = render(row);
        if ([...lines, line].join("\n").length > 950) break;
        lines.push(line);
    }
    return rows.length
        ? lines.join("\n") +
              (rows.length > lines.length
                  ? `\n… ${rows.length - lines.length} more`
                  : "")
        : empty;
};

/** Match current Stripe state against the atomic refund ledger; never change money. */
export async function collectRefundReport(stripe, query, until) {
    const refunds = [];
    for await (const refund of stripe.refunds.list({
        limit: 100,
        created: { gte: FRAUD_SCAN_START_SECONDS, lte: until },
    }))
        refunds.push(refund);
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
            Number.isFinite(row.pollen_reversed);
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

/** One bounded Discord embed; all five sections remain visible even on quiet days. */
export function buildFraudReport(
    scan,
    refunds,
    previous,
    health,
    now = Date.now(),
) {
    const snapshot =
        scan && refunds
            ? {
                  at: now,
                  scores: Object.fromEntries(
                      scan.report.map((user) => [user.id, user.score]),
                  ),
                  warnings: scan.warnings,
                  disputes: Object.fromEntries(
                      scan.disputes.map((dispute) => [
                          dispute.id,
                          dispute.status,
                      ]),
                  ),
                  refunds: Object.fromEntries(
                      refunds.map((refund) => [
                          refund.id,
                          `${refund.status}:${refund.pollen}:${refund.issue}`,
                      ]),
                  ),
              }
            : null;
    const open = (scan?.disputes ?? [])
        .filter(needsResponse)
        .sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity));
    const urgent = open.filter(
        (dispute) => dispute.due && dispute.due * 1000 <= now + 48 * 3600_000,
    );
    const since = previous?.at ?? now - 86400_000;
    const changedRefunds = (refunds ?? []).filter(
        (refund) =>
            refund.issue ||
            refund.created * 1000 >= since ||
            (previous?.refunds[refund.id] &&
                previous.refunds[refund.id] !== snapshot?.refunds[refund.id]),
    );
    changedRefunds.sort(
        (a, b) =>
            Number(Boolean(b.issue)) - Number(Boolean(a.issue)) ||
            b.created - a.created,
    );
    const newCount = (ids, old) => ids.filter((id) => !old.includes(id)).length;
    const changes =
        snapshot && previous
            ? [
                  `${newCount(scan.warnings, previous.warnings)} new issuer warnings`,
                  `${newCount(Object.keys(snapshot.scores), Object.keys(previous.scores))} new review accounts`,
                  `${Object.entries(snapshot.scores).filter(([id, score]) => previous.scores[id] !== undefined && score > previous.scores[id]).length} increased scores`,
                  `${newCount(Object.keys(snapshot.disputes), Object.keys(previous.disputes))} new disputes`,
                  `${scan.disputes.filter((d) => previous.disputes[d.id] && !["won", "lost", "warning_closed", "prevented"].includes(previous.disputes[d.id]) && ["won", "lost", "warning_closed", "prevented"].includes(d.status)).length} closed disputes`,
                  `${Object.keys(previous.scores).filter((id) => !(id in snapshot.scores)).length} accounts left review queue (not proof of resolution)`,
              ].join(" · ")
            : "First complete report establishes the comparison baseline.";
    const fields = [
        {
            name: `⏰ Disputes · ${scan ? open.length : "?"} need a response${urgent.length ? ` · ${urgent.length} due within 48h or overdue` : ""}`,
            value: scan
                ? shortList(
                      open,
                      (d) =>
                          `${link("disputes", d.id)} · ${money(d.amount, d.currency)} · ${text(d.reason)} · ${text(d.status)} · ${d.due ? `due <t:${d.due}:f>` : "deadline unavailable"}`,
                      "None awaiting a response.",
                  )
                : "Unavailable: scan incomplete.",
        },
        {
            name: `🔎 Fraud review · ${scan?.report.length ?? "?"} accounts`,
            value: scan
                ? shortList(
                      scan.report,
                      (user) => {
                          const payment = user.payments[0];
                          const reasons = user.breakdown
                              .map(
                                  (r) =>
                                      `${r.count} ${labels[r.signal]} (+${r.contribution.toFixed(2)})`,
                              )
                              .join(", ");
                          return `**${text(user.name || user.id)} · ${user.score.toFixed(2)}** — ${reasons}\n${payment ? `${link("payments", payment.id)} · ${money(payment.amount, payment.currency)} · ${date(payment.created)} · refunded ${money(payment.refunded, payment.currency)}` : "No payment details"}`;
                      },
                      "No accounts awaiting review.",
                  )
                : "Unavailable: scan incomplete.",
        },
        {
            name: `↩️ Refunds · ${refunds ? refunds.filter((r) => r.issue).length : "?"} unverified`,
            value: refunds
                ? shortList(
                      changedRefunds,
                      (r) =>
                          `${link("payments", r.chargeId)} · ${money(r.amount, r.currency)} · ${r.status}\n${r.issue || (r.pollen === null ? "Awaiting completion" : r.pollen === 0 ? "No Pollen adjustment" : `${r.pollen} Pollen ${r.status === "succeeded" ? "deducted" : "restored"}`)}`,
                      "No new refunds or reconciliation issues.",
                  )
                : "Unavailable: refund ledger/scan incomplete. Requires refund webhook deployment.",
        },
        {
            name: `📊 Changes${previous ? ` since ${new Date(previous.at).toISOString().slice(0, 10)}` : ""}`,
            value: snapshot
                ? changes
                : "Unavailable: incomplete scans never replace the comparison baseline.",
        },
        {
            name: "🩺 Scan health",
            value: `${health.error ? `Incomplete: ${health.error}` : `Complete · ${scan.charges} charges · ${scan.unmapped} unattributed`}\n${health.requests} Stripe requests · ${health.seconds}s · last complete scan: ${health.lastSuccess ? new Date(health.lastSuccess).toISOString() : "none recorded"}`,
        },
    ];
    return {
        snapshot,
        payload: {
            allowed_mentions: { parse: [] },
            embeds: [
                {
                    title: `Stripe daily report · ${new Date(now).toISOString().slice(0, 10)}`,
                    color: health.error
                        ? 0xd95050
                        : urgent.length || changedRefunds.some((r) => r.issue)
                          ? 0xe5a02b
                          : 0x74b55d,
                    description:
                        "Manual review · No bans or refunds performed. Issuer warnings mean suspected fraud. Scores are not probabilities.",
                    fields: fields.map((field) => ({
                        ...field,
                        value: field.value.slice(0, 1024),
                    })),
                    footer: {
                        text: "History from 1 May 2026 · Strongest signal per charge counts · Up to 3 items per section",
                    },
                },
            ],
        },
    };
}

export async function postFraudReport(
    webhookUrl,
    payload,
    fetchImpl,
    messageId,
) {
    const url = new URL(webhookUrl);
    if (messageId) url.pathname += `/messages/${encodeURIComponent(messageId)}`;
    url.searchParams.set("wait", "true");
    const response = await fetchImpl(url.toString(), {
        method: messageId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
        throw new FraudCheckError(
            `Discord report failed: HTTP ${response.status}`,
        );
    const message = await response.json();
    if (!/^\d+$/.test(message.id))
        throw new FraudCheckError("Discord did not confirm report delivery");
    return message.id;
}

/** Save the comparison baseline only after delivery; reruns edit today's message. */
export async function runDailyReport({
    stripe,
    query,
    store,
    webhookUrl,
    excludedUserIds = [],
    fetchImpl = fetch,
    now = Date.now(),
}) {
    const day = new Date(now).toISOString().slice(0, 10);
    let state;
    let error = null;
    try {
        state = await store.read();
    } catch (failure) {
        error = fraudCheckErrorMessage(failure);
    }
    const previous = state?.day === day ? state.baseline : state?.latest;
    let requests = 0;
    const countRequest = () => {
        requests++;
    };
    stripe.on("request", countRequest);
    const started = Date.now();
    let scan = null;
    let refunds = null;
    try {
        if (error) throw new FraudCheckError(error);
        scan = await runFraudBanCheck(stripe, query, {
            apply: false,
            excludedUserIds,
        });
        refunds = await collectRefundReport(
            stripe,
            query,
            Math.floor(now / 1000),
        );
    } catch (failure) {
        error = fraudCheckErrorMessage(failure);
    } finally {
        stripe.off("request", countRequest);
    }
    const { snapshot, payload } = buildFraudReport(
        scan,
        refunds,
        previous,
        {
            error,
            requests,
            seconds: Math.round((Date.now() - started) / 1000),
            lastSuccess: error ? state?.latest?.at : now,
        },
        now,
    );
    const messageId = await postFraudReport(
        webhookUrl,
        payload,
        fetchImpl,
        state?.day === day ? state.messageId : null,
    );
    if (state !== undefined) {
        try {
            await store.write({
                day,
                messageId,
                baseline: previous ?? null,
                latest: snapshot ?? state?.latest ?? null,
            });
        } catch (failure) {
            error = fraudCheckErrorMessage(failure);
            payload.embeds[0].color = 0xd95050;
            payload.embeds[0].fields.at(-1).value +=
                `\nHistory not saved: ${error}`;
            await postFraudReport(webhookUrl, payload, fetchImpl, messageId);
        }
    }
    return !error;
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
    // Existing private Enter KV. Never put account history in public Actions artifacts.
    const stateUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/a621f17ad3e34000971cffa616675c5b/values/billing:stripe-daily-report`;
    async function stateRequest(method, value) {
        const response = await fetch(stateUrl, {
            method,
            headers: {
                Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
                "Content-Type": "application/json",
            },
            ...(method === "PUT" ? { body: JSON.stringify(value) } : {}),
            signal: AbortSignal.timeout(30000),
        });
        if (method === "GET" && response.status === 404) return null;
        if (!response.ok)
            throw new FraudCheckError(
                `Report history ${method} failed: HTTP ${response.status}`,
            );
        const data = await response.json();
        if (method === "PUT" && !data.success)
            throw new FraudCheckError("Report history was not saved");
        return data;
    }
    const complete = await runDailyReport({
        stripe,
        query,
        webhookUrl,
        store: {
            read: () => stateRequest("GET"),
            write: (value) => stateRequest("PUT", value),
        },
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
