import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";
import { FraudCheckError } from "../src/utils/stripe-fraud-score.ts";
import {
    buildFraudReport,
    collectRefundReport,
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
const scan = {
    candidates: 1,
    applied: 0,
    charges: 350,
    unmapped: 12,
    warnings: ["issfr_new"],
    disputes: [
        {
            id: "dp_new",
            chargeId: "ch_a",
            status: "needs_response",
            reason: "duplicate",
            amount: 1500,
            currency: "usd",
            due: now / 1000 + 3600,
        },
        { id: "dp_closed", status: "won" },
    ],
    report: [
        {
            id: "u_1",
            name: "alice @everyone\n**spoof**",
            score: 0.15,
            breakdown: [{ signal: "ew", count: 1, contribution: 0.15 }],
            payments: [
                {
                    id: "ch_a",
                    amount: 500,
                    currency: "usd",
                    created: now / 1000 - 3600,
                    refunded: 0,
                },
            ],
        },
    ],
};
const previous = {
    at: now - 86400_000,
    scores: { u_1: 0.08, u_gone: 0.8 },
    warnings: [],
    disputes: { dp_closed: "under_review" },
    refunds: {},
};
const health = { requests: 7, seconds: 12, lastSuccess: now };

test("one compact daily message has five sections, reasons, deadlines and real changes", () => {
    const { payload, snapshot } = buildFraudReport(
        scan,
        [],
        previous,
        health,
        now,
    );
    assert.equal(payload.embeds.length, 1);
    assert.equal(payload.embeds[0].fields.length, 5);
    const content = JSON.stringify(payload);
    for (const expected of [
        "issuer warnings (+0.15)",
        "$5.00",
        "needs response",
        "due within 48h",
        "1 increased scores",
        "1 closed disputes",
        "1 accounts left review queue",
        "7 Stripe requests",
        "No bans or refunds performed",
    ])
        assert.ok(content.includes(expected), expected);
    assert.doesNotMatch(content, /@everyone|\*\*spoof/);
    assert.deepEqual(payload.allowed_mentions, { parse: [] });
    assert.equal(snapshot.at, now);
});

test("quiet days and incomplete scans are explicit, and embeds stay within Discord limits", () => {
    const quiet = buildFraudReport(
        { ...scan, report: [], disputes: [], warnings: [] },
        [],
        null,
        health,
        now,
    );
    assert.match(JSON.stringify(quiet.payload), /No accounts awaiting review/);
    assert.match(JSON.stringify(quiet.payload), /First complete report/);
    const failed = buildFraudReport(
        null,
        null,
        previous,
        { ...health, error: "Stripe unavailable" },
        now,
    );
    assert.equal(failed.snapshot, null);
    assert.match(JSON.stringify(failed.payload), /Unavailable/);
    assert.doesNotMatch(
        JSON.stringify(failed.payload),
        /0 unverified|0 need a response/,
    );
    const busy = buildFraudReport(
        { ...scan, report: Array(100).fill(scan.report[0]) },
        [],
        previous,
        health,
        now,
    ).payload.embeds[0];
    assert.match(JSON.stringify(busy), /more/);
    assert.ok(
        busy.fields.every(
            (field) => field.value.length <= 1024 && field.name.length <= 256,
        ),
    );
    assert.ok(
        busy.fields.reduce(
            (n, f) => n + f.name.length + f.value.length,
            busy.title.length +
                busy.description.length +
                busy.footer.text.length,
        ) <= 6000,
    );
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
        assert.equal(params.length, 5);
        return [{ results: rows }];
    };
    const result = await collectRefundReport(stripe, query, now / 1000);
    assert.equal(result[0].pollen, 5);
    assert.equal(result[1].pollen, 5);
    assert.equal(result[2].issue, "Pollen adjustment unverified");
    assert.equal(result[3].pollen, null);
    assert.equal(result[3].issue, null);
    assert.equal(result[4].issue, "Pollen adjustment unverified");
    const report = buildFraudReport(scan, [result[1]], previous, health, now);
    assert.match(JSON.stringify(report.payload), /5 Pollen restored/);
});

test("Discord delivery is one message, edits use the same ID, and failed sends expose no webhook", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url, init });
        return { ok: true, json: async () => ({ id: "123" }) };
    };
    const payload = buildFraudReport(scan, [], previous, health, now).payload;
    assert.equal(
        await postFraudReport(
            "https://discord.test/api/webhooks/1/SECRET",
            payload,
            fetchImpl,
        ),
        "123",
    );
    await postFraudReport(
        "https://discord.test/api/webhooks/1/SECRET",
        payload,
        fetchImpl,
        "123",
    );
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[1].init.method, "PATCH");
    assert.match(calls[1].url, /messages\/123\?wait=true$/);
    assert.deepEqual(JSON.parse(calls[0].init.body).allowed_mentions, {
        parse: [],
    });
    await assert.rejects(
        postFraudReport("https://discord.test/SECRET", payload, async () => ({
            ok: false,
            status: 429,
        })),
        (error) => error.message === "Discord report failed: HTTP 429",
    );
});

test("incomplete scans preserve the last good baseline and same-day retries edit the report", async () => {
    let state = {
        day: "2026-09-16",
        messageId: "122",
        latest: previous,
        baseline: null,
    };
    const store = {
        read: async () => state,
        write: async (value) => {
            state = value;
        },
    };
    const stripe = new Stripe("sk_test_mock", { maxNetworkRetries: 0 });
    // Fail at account validation, before any Stripe pagination or D1 writes.
    stripe.accounts.retrieve = async () => ({ id: "wrong_account" });
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url, init });
        return { ok: true, json: async () => ({ id: "123" }) };
    };
    const args = {
        stripe,
        query: async () => {
            throw Error("must not query");
        },
        store,
        webhookUrl: "https://discord.test/hook/SECRET",
        fetchImpl,
        now,
    };
    assert.equal(await runDailyReport(args), false);
    assert.equal(state.latest, previous);
    assert.equal(calls[0].init.method, "POST");
    assert.equal(await runDailyReport(args), false);
    assert.equal(calls[1].init.method, "PATCH");
    assert.equal(state.baseline, previous);
    assert.match(calls[1].init.body, /Unexpected Stripe account/);
});

test("successful scans are read-only, keep yesterday for reruns, and never checkpoint failed delivery", async () => {
    const stripe = new Stripe("sk_test_mock", { maxNetworkRetries: 0 });
    stripe.accounts.retrieve = async () => ({ id: "acct_1SrY3q7rcjS3l7tr" });
    stripe.charges.list = () => [
        {
            id: "ch_a",
            livemode: true,
            metadata: { userId: "u_1" },
            amount: 500,
            currency: "usd",
            amount_refunded: 0,
            created: now / 1000,
        },
    ];
    stripe.disputes.list = () => [];
    stripe.radar.earlyFraudWarnings.list = () => [
        { id: "issfr_new", livemode: true, charge: "ch_a" },
    ];
    stripe.refunds.list = () => [];
    const query = async ({ sql }) => {
        assert.match(sql, /^SELECT /);
        return [
            {
                results: [
                    {
                        id: "u_1",
                        stripe_customer_id: null,
                        name: "alice",
                        banned: 0,
                        ban_expires: null,
                    },
                ],
            },
        ];
    };
    let state = {
        day: "2026-09-16",
        messageId: "122",
        latest: previous,
        baseline: null,
    };
    const store = {
        read: async () => state,
        write: async (value) => {
            state = value;
        },
    };
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url, init });
        return { ok: true, json: async () => ({ id: "123" }) };
    };
    const args = {
        stripe,
        query,
        store,
        webhookUrl: "https://discord.test/hook/SECRET",
        fetchImpl,
        now,
    };
    assert.equal(await runDailyReport(args), true);
    assert.equal(state.latest.scores.u_1, 0.15);
    assert.equal(state.baseline, previous);
    assert.equal(await runDailyReport(args), true);
    assert.equal(state.baseline, previous);
    assert.equal(calls[1].init.method, "PATCH");
    assert.match(calls[1].init.body, /1 increased scores/);
    const saved = state;
    await assert.rejects(
        runDailyReport({
            ...args,
            now: now + 86400_000,
            fetchImpl: async () => ({ ok: false, status: 500 }),
        }),
        /Discord report failed/,
    );
    assert.equal(state, saved);
});

test("history failures are visible in the same daily message", async () => {
    const stripe = new Stripe("sk_test_mock", { maxNetworkRetries: 0 });
    stripe.accounts.retrieve = async () => {
        throw Error("must not reach Stripe");
    };
    const sent = [];
    const fetchImpl = async (url, init) => {
        sent.push({ url, init });
        return { ok: true, json: async () => ({ id: "123" }) };
    };
    const args = {
        stripe,
        query: async () => [],
        webhookUrl: "https://discord.test/hook/SECRET",
        fetchImpl,
        now,
    };
    assert.equal(
        await runDailyReport({
            ...args,
            store: {
                read: async () => {
                    throw new FraudCheckError(
                        "Report history GET failed: HTTP 403",
                    );
                },
                write: async () => {
                    throw Error("must not overwrite unread history");
                },
            },
        }),
        false,
    );
    assert.equal(sent.length, 1);
    assert.match(sent[0].init.body, /Report history GET failed: HTTP 403/);
    stripe.accounts.retrieve = async () => ({ id: "wrong_account" });
    assert.equal(
        await runDailyReport({
            ...args,
            store: {
                read: async () => null,
                write: async () => {
                    throw new FraudCheckError(
                        "Report history PUT failed: HTTP 403",
                    );
                },
            },
        }),
        false,
    );
    assert.equal(sent.at(-1).init.method, "PATCH");
    assert.match(sent.at(-1).init.body, /History not saved/);
});
