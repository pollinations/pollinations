import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";
import { FraudCheckError } from "../src/utils/stripe-fraud-score.ts";
import {
    collectDailyEvidence,
    collectRefundReport,
    formatDailyReport,
    fraudCheckErrorMessage,
    postFraudReport,
    runDailyReport,
} from "./check-fraud-bans.mjs";

test("missing CLI arguments produce an actionable error and nonzero exit", () => {
    const result = spawnSync(
        process.execPath,
        [
            "--experimental-strip-types",
            fileURLToPath(new URL("./check-fraud-bans.mjs", import.meta.url)),
        ],
        { encoding: "utf8" },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--secrets-file is required/);
});

test("application-authored diagnostics are preserved", () => {
    assert.equal(
        fraudCheckErrorMessage(new FraudCheckError("Invalid D1 user page")),
        "Invalid D1 user page",
    );
    assert.equal(
        fraudCheckErrorMessage(
            new FraudCheckError("D1 query failed: HTTP 403"),
        ),
        "D1 query failed: HTTP 403",
    );
});

test("Stripe errors expose HTTP status but not response contents", () => {
    const error = new Stripe.errors.StripeAuthenticationError({
        message: "PRIVATE_CONTENT",
        statusCode: 401,
    });
    const message = fraudCheckErrorMessage(error);
    assert.match(message, /Stripe request failed.*HTTP 401/);
    assert.doesNotMatch(message, /PRIVATE_CONTENT/);
});

test("parser, filesystem, and unknown errors never expose raw contents", () => {
    for (const error of [
        new SyntaxError("PRIVATE_CONTENT"),
        new Error("PRIVATE_CONTENT"),
        "PRIVATE_CONTENT",
    ]) {
        assert.doesNotMatch(fraudCheckErrorMessage(error), /PRIVATE_CONTENT/);
    }
    assert.match(
        fraudCheckErrorMessage(new SyntaxError("PRIVATE_CONTENT")),
        /Invalid JSON/,
    );
    assert.match(
        fraudCheckErrorMessage({ code: "ENOENT", message: "PRIVATE_CONTENT" }),
        /file not found/,
    );
    assert.match(
        fraudCheckErrorMessage({ code: "EACCES", message: "PRIVATE_CONTENT" }),
        /permission denied/,
    );
    assert.match(
        fraudCheckErrorMessage({
            name: "TimeoutError",
            message: "PRIVATE_CONTENT",
        }),
        /timed out/,
    );
});

const now = Date.UTC(2026, 8, 17, 7, 17);
const ledgerStart = now / 1000 - 14 * 86400;
const response = (body) => ({ ok: true, json: async () => body });

function sources() {
    const stripe = new Stripe("sk_test_mock", { maxNetworkRetries: 0 });
    stripe.accounts.retrieve = async () => ({ id: "acct_1SrY3q7rcjS3l7tr" });
    const charge = (id, userId, extra = {}) => ({
        id,
        livemode: true,
        metadata: { userId, private: "PRIVATE_CONTENT" },
        amount: 500,
        currency: "usd",
        amount_refunded: 0,
        created: now / 1000,
        ...extra,
    });
    // u_2 carries three fraud disputes and one fraud report: 0.81 > 0.75.
    stripe.charges.list = () => [
        charge("ch_a", "u_1"),
        charge("ch_b", "u_2"),
        charge("ch_c", "u_2"),
        charge("ch_d", "u_2"),
        charge("ch_e", "u_2", {
            fraud_details: { stripe_report: "fraudulent" },
        }),
    ];
    stripe.disputes.list = () =>
        ["ch_b", "ch_c", "ch_d"].map((id) => ({
            id: `dp_${id}`,
            livemode: true,
            charge: id,
            reason: "fraudulent",
            status: "lost",
            amount: 500,
            currency: "usd",
            created: now / 1000,
        }));
    stripe.radar.earlyFraudWarnings.list = () => [
        { id: "issfr_a", livemode: true, charge: "ch_a" },
    ];
    stripe.refunds.list = () => [];
    stripe.events.list = (params) => {
        assert.deepEqual(params.created, {
            gte: now / 1000 - 86400,
            lte: now / 1000,
        });
        assert.ok(params.types.includes("charge.dispute.closed"));
        return [
            {
                id: "evt_a",
                livemode: true,
                type: "charge.dispute.closed",
                created: now / 1000,
                data: {
                    object: {
                        id: "dp_a",
                        status: "won",
                        email: "PRIVATE_CONTENT",
                    },
                },
            },
        ];
    };
    const query = async ({ sql }) => {
        assert.match(sql, /^SELECT /);
        return [
            {
                results: [
                    {
                        id: "u_1",
                        stripe_customer_id: null,
                        name: "PRIVATE_CONTENT",
                        github_username: "bee_runner",
                        banned: 0,
                        ban_expires: null,
                    },
                    {
                        id: "u_2",
                        stripe_customer_id: null,
                        name: "PRIVATE_CONTENT",
                        github_username: "bee_runner",
                        banned: 0,
                        ban_expires: null,
                    },
                ],
            },
        ];
    };
    return { stripe, query };
}

test("collector shows unbanned review accounts, pending disputes and no historical event feed", async () => {
    const { stripe, query } = sources();
    stripe.events.list = () => {
        throw new Error("Must not fetch historical events");
    };
    const evidence = await collectDailyEvidence(
        stripe,
        query,
        [],
        now,
        ledgerStart,
    );
    const warned = evidence.fraudReview.shown.find((row) => row.id === "u_1");
    assert.equal(warned.score, 0.15);
    assert.equal(warned.label, "bee_runner");
    assert.equal(warned.paymentId, "ch_a");
    assert.equal(evidence.fraudReview.shown[0].score, 0.81);
    assert.equal(evidence.disputes.total, 0); // All fixture disputes are closed.
    assert.equal(evidence.health.complete, true);
    assert.doesNotMatch(JSON.stringify(evidence), /PRIVATE_CONTENT/);
    const bannedQuery = async (body) =>
        (await query(body)).map((page) => ({
            results: page.results.map((u) => ({
                ...u,
                banned: u.id === "u_2" ? 1 : 0,
            })),
        }));
    const filtered = await collectDailyEvidence(
        stripe,
        bannedQuery,
        [],
        now,
        ledgerStart,
    );
    assert.deepEqual(
        filtered.fraudReview.shown.map((u) => u.id),
        ["u_1"],
    );
});

test("missing refund ledger preserves review evidence and gives an actionable blocked check", async () => {
    const { stripe, query } = sources();
    stripe.refunds.list = () => [{ id: "re_a" }];
    const missingLedger = async (body) =>
        body.sql.includes("sqlite_master") ? [{ results: [] }] : query(body);
    const evidence = await collectDailyEvidence(
        stripe,
        missingLedger,
        [],
        now,
        ledgerStart,
    );
    const report = formatDailyReport(evidence);
    assert.equal(evidence.health.complete, false);
    assert.match(report, /Accounts to review/);
    assert.match(report, /Deploy the refund ledger/);
    assert.doesNotMatch(
        report,
        /HTTP|INCOMPLETE REPORT|Nothing needs attention/,
    );
});

test("one bounded Discord post disables mentions and embeds without calling a model", async () => {
    const calls = [];
    const complete = await runDailyReport({
        ...sources(),
        webhookUrl: "https://discord.test/SECRET",
        now,
        refundLedgerStartSeconds: ledgerStart,
        fetchImpl: async (url, init) => {
            calls.push({ url, init });
            return response({ id: "123" });
        },
    });
    assert.equal(complete, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://discord.test/SECRET?wait=true");
    const sent = JSON.parse(calls[0].init.body);
    assert.deepEqual(sent.allowed_mentions, { parse: [] });
    assert.equal(sent.flags, 4);
    assert.ok(sent.content.length <= 2000);
    assert.match(sent.content, /No actions performed/);
    await assert.rejects(
        postFraudReport("https://discord.test/SECRET", "brief", async () => ({
            ok: false,
            status: 429,
        })),
        (error) => error.message === "Discord report failed: HTTP 429",
    );
});

test("an unavailable scan still checks refunds and never reports all clear", async () => {
    const { stripe, query } = sources();
    stripe.charges.list = () => {
        throw new FraudCheckError("Stripe unavailable");
    };
    const evidence = await collectDailyEvidence(
        stripe,
        query,
        [],
        now,
        ledgerStart,
    );
    assert.equal(evidence.refunds.total, 0);
    assert.equal(evidence.health.complete, false);
    assert.match(
        formatDailyReport(evidence),
        /Account\/dispute checks unavailable/,
    );
    assert.doesNotMatch(formatDailyReport(evidence), /Nothing needs attention/);
});

test("refund reconciliation uses ledger amounts and distinguishes missing, pending and restored adjustments", async () => {
    const refund = {
        charge: "ch_a",
        amount: 519,
        currency: "usd",
        created: now / 1000,
    };
    const refunds = [
        { ...refund, id: "re_ok", status: "succeeded" },
        { ...refund, id: "re_failed", status: "failed" },
        { ...refund, id: "re_missing", status: "succeeded" },
        { ...refund, id: "re_pending", status: "pending" },
        { ...refund, id: "re_wrong", status: "succeeded" },
    ];
    const stripe = { refunds: { list: () => refunds } };
    const rows = [
        {
            refund_id: "re_ok",
            status: "succeeded",
            amount: 519,
            pollen_reversed: 5,
        },
        {
            refund_id: "re_failed",
            status: "failed",
            amount: 519,
            pollen_reversed: 5,
        },
        {
            refund_id: "re_wrong",
            status: "succeeded",
            amount: 1,
            pollen_reversed: 5,
        },
    ].map((row) => ({ charge_id: "ch_a", currency: "usd", ...row }));
    const query = async ({ sql, params }) => {
        assert.match(sql, /^SELECT /);
        if (sql.includes("sqlite_master"))
            return [{ results: [{ name: "stripe_refund" }] }];
        assert.equal(params.length, 5);
        return [{ results: rows }];
    };
    const result = await collectRefundReport(
        stripe,
        query,
        now / 1000,
        ledgerStart,
    );
    assert.equal(result[0].pollen, 5);
    assert.equal(result[1].pollen, 5);
    assert.equal(result[2].issue, "Pollen adjustment unverified");
    assert.equal(result[3].pollen, null);
    assert.equal(result[3].issue, null);
    assert.equal(result[4].issue, "Pollen adjustment unverified");
});

test("refund scan excludes pre-activation refunds but keeps missing adjustments at and after activation", async () => {
    const { stripe, query } = sources();
    stripe.refunds.list = ({ created }) => {
        assert.deepEqual(created, { gte: ledgerStart, lte: now / 1000 });
        return [ledgerStart - 1, ledgerStart, now / 1000]
            .filter((at) => at >= created.gte && at <= created.lte)
            .map((at) => ({
                id: `re_${at}`,
                charge: "ch_a",
                amount: 500,
                currency: "usd",
                status: "succeeded",
                created: at,
            }));
    };
    const ledgerQuery = async (body) =>
        body.sql.includes("FROM stripe_refund")
            ? [{ results: [] }]
            : query(body);
    const evidence = await collectDailyEvidence(
        stripe,
        ledgerQuery,
        [],
        now,
        ledgerStart,
    );
    assert.equal(evidence.refunds.total, 2);
    assert.deepEqual(
        evidence.refunds.shown.map((r) => r.created),
        [ledgerStart, now / 1000],
    );
    assert.match(formatDailyReport(evidence), /Refunds to reconcile · 2/);
});

test("missing, invalid or future activation time blocks refunds without scanning history", async () => {
    const { stripe, query } = sources();
    stripe.refunds.list = () => {
        throw new Error("Must not scan without a valid activation time");
    };
    for (const since of [undefined, NaN, 0, -1, 1.5, now / 1000 + 1]) {
        const evidence = await collectDailyEvidence(
            stripe,
            query,
            [],
            now,
            since,
        );
        assert.equal(evidence.health.complete, false);
        assert.equal(evidence.refunds, undefined);
        assert.match(evidence.errors[0], /Refund ledger start time/);
        const report = formatDailyReport(evidence);
        assert.match(report, /Accounts to review/);
        assert.match(report, /Set the report’s refund start time/);
        assert.doesNotMatch(report, /Nothing needs attention/);
    }
});

test("a reconciled older failed refund stays out of the active report", async () => {
    const { stripe, query } = sources();
    stripe.refunds.list = () => [
        {
            id: "re_old",
            charge: "ch_a",
            status: "failed",
            amount: 519,
            currency: "usd",
            created: now / 1000 - 7 * 86400,
        },
    ];
    stripe.events.list = () => [
        {
            livemode: true,
            type: "refund.failed",
            created: now / 1000,
            data: { object: { id: "re_old", status: "failed" } },
        },
    ];
    const ledgerQuery = async (body) =>
        body.sql.includes("FROM stripe_refund")
            ? [
                  {
                      results: [
                          {
                              refund_id: "re_old",
                              charge_id: "ch_a",
                              status: "failed",
                              amount: 519,
                              currency: "usd",
                              pollen_reversed: 5,
                          },
                      ],
                  },
              ]
            : query(body);
    const evidence = await collectDailyEvidence(
        stripe,
        ledgerQuery,
        [],
        now,
        ledgerStart,
    );
    assert.equal(evidence.refunds.total, 0);
    assert.doesNotMatch(formatDailyReport(evidence), /Refunds to reconcile/);
});

test("active layout uses real amounts, deadlines, reasons and links with exact remaining counts", async () => {
    const { stripe, query } = sources();
    const disputes = stripe.disputes.list();
    stripe.disputes.list = () => [
        ...disputes,
        ...Array.from({ length: 7 }, (_, i) => ({
            ...disputes[0],
            id: `dp_pending_${i}`,
            status: "needs_response",
            evidence_details: { due_by: now / 1000 + i * 86400 },
            created: now / 1000 - 30 * 86400,
        })),
    ];
    const evidence = await collectDailyEvidence(
        stripe,
        query,
        [],
        now,
        ledgerStart,
    );
    const report = formatDailyReport(evidence);
    assert.match(report, /Disputes to handle · 7/);
    assert.match(report, /\$5.00/);
    assert.match(report, /17 Sept?, 07:17 UTC/);
    assert.match(report, /\+4 more awaiting review/);
    assert.equal((report.match(/Review disputes/g) || []).length, 3);
    assert.match(report, /bee_runner · 0.81/);
    assert.match(report, /3 fraud disputes/);
    assert.match(report, /Consider banning after review/);
    assert.match(report, /payments\/ch_b/);
    assert.doesNotMatch(
        report,
        /Last 24h|Health|minor units|null|unmapped|shown|omitted/,
    );
    assert.ok(
        report.indexOf("Disputes to handle") <
            report.indexOf("Accounts to review"),
    );
});

test("disputes sharing a deadline aggregate all amounts without mixing currencies or closed cases", async () => {
    const { stripe, query } = sources();
    const base = stripe.disputes.list()[0];
    stripe.disputes.list = () => [
        ...Array.from({ length: 120 }, (_, i) => ({
            ...base,
            id: `dp_${i}`,
            amount: 548,
            status: "needs_response",
            evidence_details: { due_by: now / 1000 - 60 },
        })),
        {
            ...base,
            id: "dp_eur",
            currency: "eur",
            status: "warning_needs_response",
            evidence_details: { due_by: now / 1000 - 60 },
        },
        { ...base, id: "dp_closed", amount: 99999 },
    ];
    const evidence = await collectDailyEvidence(
        stripe,
        query,
        [],
        now,
        ledgerStart,
    );
    assert.equal(evidence.disputes.total, 121);
    assert.equal(evidence.disputes.shown.length, 2);
    const report = formatDailyReport(evidence);
    assert.match(report, /120 disputes · \$657\.60 USD/);
    assert.match(report, /1 dispute · €5\.00 EUR/);
    assert.equal((report.match(/🚨/g) || []).length, 2);
    assert.doesNotMatch(report, /more awaiting review/);
});

test("currency conversion handles Stripe zero-decimal and legacy two-decimal amounts", () => {
    const base = {
        at: new Date(now).toISOString(),
        errors: [],
        fraudReview: { total: 0, shown: [] },
        refunds: { total: 0, shown: [] },
    };
    for (const [currency, amount, expected] of [
        ["usd", 548, "$5.48"],
        ["jpy", 548, "¥548"],
        ["isk", 500, "ISK\u00a05"],
        ["ugx", 500, "UGX\u00a05"],
    ]) {
        const report = formatDailyReport({
            ...base,
            disputes: {
                total: 1,
                shown: [{ count: 1, currency, amount, due: null }],
            },
        });
        assert.ok(report.includes(expected), report);
        assert.match(report, /deadline unavailable/);
    }
});

test("empty sections disappear and oversized messages keep complete rows and accurate counts", () => {
    const empty = {
        at: new Date(now).toISOString(),
        errors: [],
        disputes: { total: 0, shown: [] },
        fraudReview: { total: 0, shown: [] },
        refunds: { total: 0, shown: [] },
    };
    const clear = formatDailyReport(empty);
    assert.match(clear, /Nothing needs attention/);
    assert.doesNotMatch(
        clear,
        /Disputes to handle|Accounts to review|Refunds to reconcile/,
    );
    const report = formatDailyReport({
        ...empty,
        refunds: {
            total: 40,
            shown: Array.from({ length: 3 }, (_, i) => ({
                amount: 500,
                currency: "usd",
                status: "succeeded",
                issue: "Pollen adjustment unverified",
                chargeId: `ch_${i}${"x".repeat(600)}`,
            })),
        },
    });
    assert.ok(report.length <= 2000);
    const displayed = (report.match(/Open payment/g) || []).length;
    assert.ok(displayed > 0 && displayed < 3);
    assert.ok(report.includes(`+${40 - displayed} more awaiting review`));
    assert.ok(report.endsWith("_Manual review only. No actions performed._"));
});
