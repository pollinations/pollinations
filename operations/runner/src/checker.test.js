import assert from "node:assert/strict";
import test from "node:test";
import { checkReport, cleanLine, parseReport, redact } from "./checker.js";

const rules = {
    ids: new Set(["F1", "C1"]),
    fetched: ["https://example.com/app/"],
    requirements: ["works", "uses_pollinations", "sign_in"],
    optional: ["sign_in"],
};
const status = (result) =>
    Object.fromEntries(result.findings.map((f) => [f.requirement, f.status]));

test("checkReport keeps claims that cite real evidence", () => {
    const result = checkReport(
        {
            findings: [
                { requirement: "works", status: "supported", evidence: ["F1"] },
                {
                    requirement: "uses_pollinations",
                    status: "supported",
                    evidence: ["https://example.com/app"],
                },
                { requirement: "sign_in", status: "not_applicable" },
            ],
        },
        rules,
    );
    assert.deepEqual(status(result), {
        works: "supported",
        uses_pollinations: "supported",
        sign_in: "not_applicable",
    });
    assert.equal(result.contradicted, false);
});

test("checkReport makes uncited, invented or missing claims unverified", () => {
    const result = checkReport(
        {
            findings: [
                { requirement: "works", status: "supported", evidence: [] },
                {
                    requirement: "uses_pollinations",
                    status: "contradicted",
                    evidence: ["F9", "https://never-fetched.example"],
                },
            ],
            questions: ["Add the badge"],
        },
        rules,
    );
    assert.deepEqual(status(result), {
        works: "unverified",
        uses_pollinations: "unverified",
        sign_in: "unverified",
    });
    assert.deepEqual(result.questions, []);
});

test("checkReport allows not_applicable only for optional checks", () => {
    const result = checkReport(
        { findings: [{ requirement: "works", status: "not_applicable" }] },
        rules,
    );
    assert.equal(status(result).works, "unverified");
});

test("cleanLine removes every kind of link and escapes Markdown", () => {
    const line = cleanLine(
        "see //evil.example/x, www.evil.example, ftp://x.y and [click](javascript:alert(1)) **bold** | @bob <b>",
        400,
    );
    assert.doesNotMatch(line, /evil\.example|ftp:/);
    assert.match(line, /\\\[click\\\]/);
    assert.match(line, /\\\*\\\*bold\\\*\\\*/);
    assert.match(line, /\\\|/);
    assert.match(line, /@​bob b/);
});

test("parseReport reads JSON wrapped in prose and rejects no JSON", () => {
    assert.deepEqual(parseReport('Here: {"findings": []} done').findings, []);
    assert.throws(() => parseReport("all good"), /no JSON/);
});

test("redact hides key-shaped strings", () => {
    assert.equal(
        redact("key sk_jHb2aOX45mCfzpQd and plln_sk_abcdefgh123"),
        "key sk_[redacted] and sk_[redacted]",
    );
});
