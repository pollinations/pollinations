import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";
import { FraudCheckError } from "../src/utils/stripe-fraud-score.ts";
import {
    buildFraudReport,
    fraudCheckErrorMessage,
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

const scan = {
    candidates: 2,
    applied: 0,
    charges: 350,
    unmapped: 12,
    report: [
        { id: "u_1", name: "alice", score: 1.25 },
        { id: "u_2", name: null, score: 0.8 },
    ],
};

test("report summarises counts and lists candidates only in the attached file", () => {
    const readOnly = buildFraudReport(scan, false);
    assert.equal(
        readOnly.content,
        "Fraud ban check · read-only · 2 candidates · 2 awaiting review · 350 charges scanned, 12 unmapped",
    );
    assert.match(
        readOnly.file.name,
        /^fraud-candidates-\d{4}-\d{2}-\d{2}\.tsv$/,
    );
    assert.equal(
        readOnly.file.body,
        "score\tuser_id\tname\n1.25\tu_1\talice\n0.80\tu_2\t\n",
    );
    const applied = buildFraudReport({ ...scan, applied: 2 }, true);
    assert.match(applied.content, /bans applied: 2/);
    assert.equal(buildFraudReport({ ...scan, report: [] }, false).file, null);
});

test("report is posted as multipart without mentions and failures hide the webhook", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url, init });
        return { ok: true, status: 204 };
    };
    await postFraudReport(
        "https://discord.test/hook/SECRET",
        scan,
        false,
        fetchImpl,
    );
    assert.equal(calls.length, 1);
    const form = calls[0].init.body;
    assert.deepEqual(JSON.parse(form.get("payload_json")), {
        content: buildFraudReport(scan, false).content,
        allowed_mentions: { parse: [] },
    });
    assert.match(await form.get("files[0]").text(), /u_1\talice/);
    await assert.rejects(
        postFraudReport(
            "https://discord.test/hook/SECRET",
            scan,
            false,
            async () => ({
                ok: false,
                status: 429,
            }),
        ),
        (error) =>
            error instanceof FraudCheckError &&
            error.message === "Discord report failed: HTTP 429",
    );
});
