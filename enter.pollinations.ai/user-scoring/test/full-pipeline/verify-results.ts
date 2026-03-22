#!/usr/bin/env npx tsx
/**
 * Verify pipeline test results against expected outcomes.
 *
 * Run after the replay scripts to check that the pipelines behaved correctly.
 *
 * Usage:
 *   cd enter.pollinations.ai
 *   npx tsx user-scoring/test/verify-results.ts
 *   npx tsx user-scoring/test/verify-results.ts --group a
 *   npx tsx user-scoring/test/verify-results.ts --group daily
 */

import { existsSync, readFileSync } from "node:fs";
import { queryD1ForEnv } from "../shared/d1.ts";
import { buildEmailFilter } from "../shared/email-cohort.ts";

const ENV = "staging" as const;

interface CheckResult {
    name: string;
    pass: boolean;
    detail: string;
}

function loadEmails(path: string): string[] {
    if (!existsSync(path)) return [];
    return readFileSync(path, "utf-8")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
}

function queryGroup(emails: string[]): Record<string, number>[] {
    const filter = buildEmailFilter("email", emails);
    return queryD1ForEnv(
        ENV,
        `SELECT
            COUNT(*) as total,
            SUM(CASE WHEN tier = 'microbe' THEN 1 ELSE 0 END) as microbe,
            SUM(CASE WHEN tier = 'spore' THEN 1 ELSE 0 END) as spore,
            SUM(CASE WHEN tier = 'seed' THEN 1 ELSE 0 END) as seed,
            SUM(CASE WHEN COALESCE(banned, 0) = 1 THEN 1 ELSE 0 END) as banned,
            SUM(CASE WHEN trust_score IS NOT NULL THEN 1 ELSE 0 END) as has_trust,
            SUM(CASE WHEN trust_score >= 50 THEN 1 ELSE 0 END) as trusted,
            SUM(CASE WHEN score IS NOT NULL THEN 1 ELSE 0 END) as has_score,
            SUM(CASE WHEN score_checked_at IS NOT NULL AND score_checked_at > 0 THEN 1 ELSE 0 END) as checked
         FROM user WHERE 1=1${filter}`,
    ) as Record<string, number>[];
}

function verifyGroupA(): CheckResult[] {
    const emails = loadEmails("/tmp/cohort-group-a.txt");
    if (emails.length === 0)
        return [
            {
                name: "Group A",
                pass: false,
                detail: "Missing /tmp/cohort-group-a.txt",
            },
        ];

    const row = queryGroup(emails)[0];
    const checks: CheckResult[] = [];
    const promoted = Number(row.spore ?? 0) + Number(row.seed ?? 0);

    checks.push({
        name: "A: all users have trust_score",
        pass: Number(row.has_trust) + Number(row.banned) >= emails.length,
        detail: `${row.has_trust} scored + ${row.banned} banned of ${emails.length} total`,
    });
    checks.push({
        name: "A: some blocked by trust gate",
        pass: Number(row.microbe ?? 0) + Number(row.banned ?? 0) > 0,
        detail: `${row.microbe} still microbe, ${row.banned} banned`,
    });
    checks.push({
        name: "A: majority promoted",
        pass: promoted > emails.length / 2,
        detail: `${promoted} promoted (${row.spore} spore + ${row.seed} seed) of ${emails.length}`,
    });

    return checks;
}

function verifyGroupB(): CheckResult[] {
    const emails = loadEmails("/tmp/cohort-group-b.txt");
    if (emails.length === 0)
        return [
            {
                name: "Group B",
                pass: false,
                detail: "Missing /tmp/cohort-group-b.txt",
            },
        ];

    const row = queryGroup(emails)[0];
    const seedRate = Number(row.seed ?? 0) / emails.length;

    return [
        {
            name: "B: high seed promotion (>=60%)",
            pass: seedRate >= 0.6,
            detail: `${row.seed} seed of ${emails.length} (${(seedRate * 100).toFixed(1)}%)`,
        },
        {
            name: "B: all scored",
            pass: Number(row.checked) + Number(row.banned) >= emails.length,
            detail: `${row.checked} checked + ${row.banned} banned of ${emails.length}`,
        },
    ];
}

function verifyGroupC(): CheckResult[] {
    const emailsB = loadEmails("/tmp/cohort-group-b.txt");
    const emailsC = loadEmails("/tmp/cohort-group-c.txt");
    if (emailsC.length === 0)
        return [
            {
                name: "Group C",
                pass: false,
                detail: "Missing /tmp/cohort-group-c.txt",
            },
        ];

    const rowB = queryGroup(emailsB)[0];
    const rowC = queryGroup(emailsC)[0];
    const rateB = Number(rowB.seed ?? 0) / (emailsB.length || 1);
    const rateC = Number(rowC.seed ?? 0) / (emailsC.length || 1);

    return [
        {
            name: "C: lower promotion rate than B",
            pass: rateC < rateB,
            detail: `C=${(rateC * 100).toFixed(1)}% vs B=${(rateB * 100).toFixed(1)}%`,
        },
        {
            name: "C: all scored",
            pass: Number(rowC.checked) + Number(rowC.banned) >= emailsC.length,
            detail: `${rowC.checked} checked + ${rowC.banned} banned of ${emailsC.length}`,
        },
    ];
}

function main(): void {
    const args = process.argv.slice(2);
    const groupFlag = args.indexOf("--group");
    const group = groupFlag >= 0 ? args[groupFlag + 1] : "all";

    console.log("Pipeline Test Verification\n");

    const checks: CheckResult[] = [];

    if (group === "all" || group === "a") checks.push(...verifyGroupA());
    if (group === "all" || group === "daily" || group === "b")
        checks.push(...verifyGroupB());
    if (group === "all" || group === "daily" || group === "c")
        checks.push(...verifyGroupC());

    let passed = 0;
    let failed = 0;

    for (const check of checks) {
        const icon = check.pass ? "PASS" : "FAIL";
        console.log(`  [${icon}] ${check.name}`);
        console.log(`         ${check.detail}`);
        if (check.pass) passed++;
        else failed++;
    }

    console.log(
        `\n${passed} passed, ${failed} failed of ${checks.length} checks`,
    );

    if (failed > 0) process.exit(1);
}

main();
