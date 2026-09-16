import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";
import { FraudCheckError } from "../src/utils/stripe-fraud-score.ts";
import {
    askPolli,
    collectDailyEvidence,
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
const modelReply = (
    content = "**Disputes**: none. **Fraud review**: 1 warning. Review manually.",
) => ({
    choices: [{ message: { content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 100, completion_tokens: 20 },
});
const response = (body) => ({ ok: true, json: async () => body });

function sources() {
    const stripe = new Stripe("sk_test_mock", { maxNetworkRetries: 0 });
    stripe.accounts.retrieve = async () => ({ id: "acct_1SrY3q7rcjS3l7tr" });
    stripe.charges.list = () => [
        {
            id: "ch_a",
            livemode: true,
            metadata: { userId: "u_1", private: "PRIVATE_CONTENT" },
            amount: 500,
            currency: "usd",
            amount_refunded: 0,
            created: now / 1000,
        },
    ];
    stripe.disputes.list = () => [];
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
                        banned: 0,
                        ban_expires: null,
                    },
                ],
            },
        ];
    };
    return { stripe, query };
}

test("collector reuses scores, supplies Stripe changes, and omits private/freeform fields", async () => {
    const { stripe, query } = sources();
    const evidence = await collectDailyEvidence(stripe, query, [], now);
    assert.equal(evidence.fraudReview.shown[0].score, 0.15);
    assert.equal(evidence.fraudReview.shown[0].breakdown[0].signal, "ew");
    assert.equal(evidence.fraudReview.shown[0].payments[0].amount, 500);
    assert.match(
        evidence.fraudReview.shown[0].payments[0].url,
        /payments\/ch_a$/,
    );
    assert.equal(evidence.changes.shown[0].status, "won");
    assert.equal(evidence.health.complete, true);
    assert.doesNotMatch(JSON.stringify(evidence), /PRIVATE_CONTENT/);
});

test("incomplete refund reconciliation preserves other evidence and marks the report incomplete", async () => {
    const { stripe, query } = sources();
    stripe.refunds.list = () => {
        throw new FraudCheckError("Refund ledger unavailable");
    };
    const evidence = await collectDailyEvidence(stripe, query, [], now);
    assert.equal(evidence.health.complete, false);
    assert.equal(evidence.refunds, undefined);
    assert.equal(evidence.changes.shown[0].status, "won");
    assert.match(
        evidence.errors[0],
        /Refund reconciliation: Refund ledger unavailable/,
    );
});

test("Polli only receives evidence and returns one bounded report without tools", async () => {
    const evidence = await collectDailyEvidence(
        ...Object.values(sources()),
        [],
        now,
    );
    const answer = await askPolli(evidence, "test_key", async (url, init) => {
        assert.equal(url, "https://gen.pollinations.ai/v1/chat/completions");
        const body = JSON.parse(init.body);
        assert.equal(body.model, "community/pollinations-router/polli");
        assert.deepEqual(body.tools, []);
        assert.equal(body.tool_choice, "none");
        assert.equal(body.messages[0].role, "system");
        assert.match(body.messages[0].content, /No scoring-calibration report/);
        assert.deepEqual(JSON.parse(body.messages[1].content), evidence);
        assert.doesNotMatch(
            body.messages[1].content,
            /test_key|PRIVATE_CONTENT/,
        );
        return response(modelReply());
    });
    assert.match(answer, /Review manually/);
    for (const invalid of [
        modelReply(""),
        modelReply("a".repeat(1801)),
        { ...modelReply(), usage: null },
        {
            ...modelReply(),
            choices: [
                { finish_reason: "length", message: { content: "partial" } },
            ],
        },
        {
            ...modelReply(),
            choices: [
                {
                    finish_reason: "stop",
                    message: { content: "act", tool_calls: [{}] },
                },
            ],
        },
    ])
        await assert.rejects(
            askPolli(evidence, "test_key", async () => response(invalid)),
            /invalid report/,
        );
});

test("one daily Discord post is bounded, disables mentions, and failures never expose the webhook", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url, init });
        return url.startsWith("https://gen.")
            ? response(modelReply("x".repeat(1800)))
            : response({ id: "123" });
    };
    assert.equal(
        await runDailyReport({
            ...sources(),
            webhookUrl: "https://discord.test/SECRET",
            apiKey: "test_key",
            fetchImpl,
            now,
        }),
        true,
    );
    assert.equal(calls.length, 2);
    const sent = JSON.parse(calls[1].init.body);
    assert.deepEqual(sent.allowed_mentions, { parse: [] });
    assert.ok(sent.content.length <= 2000);
    assert.match(sent.content, /No bans or refunds performed/);
    await assert.rejects(
        postFraudReport("https://discord.test/SECRET", "brief", async () => ({
            ok: false,
            status: 429,
        })),
        (error) => error.message === "Discord report failed: HTTP 429",
    );
});

test("Polli failure sends one plain failure notice instead of an invented or partial report", async () => {
    const sent = [];
    const complete = await runDailyReport({
        ...sources(),
        webhookUrl: "https://discord.test/SECRET",
        apiKey: "test_key",
        now,
        fetchImpl: async (url, init) => {
            if (url.startsWith("https://gen."))
                return { ok: false, status: 503 };
            sent.push(JSON.parse(init.body));
            return response({ id: "123" });
        },
    });
    assert.equal(complete, false);
    assert.equal(sent.length, 1);
    assert.match(sent[0].content, /INCOMPLETE REPORT/);
    assert.match(sent[0].content, /Polli summary failed: HTTP 503/);
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
});

test("a late failure of an older refund includes its restored Pollen in today's evidence", async () => {
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
    const evidence = await collectDailyEvidence(stripe, ledgerQuery, [], now);
    assert.equal(evidence.refunds.total, 1);
    assert.equal(evidence.refunds.shown[0].pollen, 5);
    assert.equal(evidence.refunds.shown[0].issue, null);
});
