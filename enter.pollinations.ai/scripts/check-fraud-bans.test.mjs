import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";
import { FraudCheckError } from "../src/utils/stripe-fraud-score.ts";
import {
    formatDailyReport,
    fraudCheckErrorMessage,
    listOpenDisputes,
    postFraudReport,
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

const account = (id, score, extra = {}) => ({
    id,
    github_username: `gh_${id}`,
    customerId: `cus_${id}`,
    score,
    ...extra,
});
const dispute = (id, status, extra = {}) => ({
    id,
    status,
    amount: 548,
    currency: "usd",
    evidence_details: { due_by: Date.UTC(2026, 8, 20, 12) / 1000 },
    ...extra,
});

test("report lists open disputes and accounts with links and a row cap", () => {
    const report = formatDailyReport({
        accounts: Array.from({ length: 7 }, (_, i) =>
            account(`u${i}`, 1 - i / 10),
        ),
        disputes: [
            dispute("dp_1", "needs_response"),
            dispute("dp_2", "warning_needs_response", {
                currency: "eur",
                evidence_details: { due_by: Date.UTC(2026, 8, 19, 8) / 1000 },
            }),
        ],
    });
    assert.match(report, /Disputes to answer · 2\*\* \(\$5\.48, €5\.48\)/);
    assert.match(report, /first due 2026-09-19 08:00 UTC/);
    assert.match(
        report,
        /gh_u0 · 1\.00 → <https:\/\/dashboard\.stripe\.com\/customers\/cus_u0>/,
    );
    assert.match(report, /\+2 more/);
    assert.doesNotMatch(report, /gh_u5/);
    assert.equal(formatDailyReport({ accounts: [], disputes: [] }), null);
});

test("only disputes awaiting a response from the last 30 days are listed", async () => {
    const now = Date.UTC(2026, 8, 17);
    const stripe = {
        disputes: {
            list: (params) => {
                assert.equal(params.created.gte, now / 1000 - 30 * 86400);
                return [
                    dispute("dp_open", "needs_response"),
                    dispute("dp_lost", "lost"),
                    dispute("dp_review", "under_review"),
                ];
            },
        },
    };
    const open = await listOpenDisputes(stripe, now);
    assert.deepEqual(
        open.map((d) => d.id),
        ["dp_open"],
    );
});

test("report is posted without mentions and failures hide the webhook", async () => {
    const calls = [];
    await postFraudReport(
        "https://discord.test/SECRET",
        "brief",
        async (url, init) => {
            calls.push({ url, init });
            return { ok: true };
        },
    );
    assert.equal(calls[0].url, "https://discord.test/SECRET");
    assert.deepEqual(JSON.parse(calls[0].init.body), {
        content: "brief",
        allowed_mentions: { parse: [] },
    });
    await assert.rejects(
        postFraudReport("https://discord.test/SECRET", "brief", async () => ({
            ok: false,
            status: 429,
        })),
        (error) => error.message === "Discord report failed: HTTP 429",
    );
});
