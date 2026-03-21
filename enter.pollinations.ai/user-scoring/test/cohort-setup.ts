#!/usr/bin/env npx tsx
/**
 * Build test cohort email files from staging D1.
 *
 * Run once after seeding staging, or whenever staging is re-seeded.
 * Creates email files in /tmp/ that the replay scripts consume.
 *
 * Usage:
 *   cd enter.pollinations.ai
 *   npx tsx user-scoring/test/cohort-setup.ts
 */

import { writeFileSync } from "node:fs";
import { queryD1 } from "../shared/d1.ts";

const ENV = "staging" as const;

interface CohortGroup {
    name: string;
    file: string;
    query: string;
    description: string;
}

const GROUPS: CohortGroup[] = [
    {
        name: "Group A",
        file: "/tmp/cohort-group-a.txt",
        query: `SELECT email FROM user WHERE tier = 'microbe' AND COALESCE(banned, 0) = 0 AND github_id IS NOT NULL ORDER BY created_at ASC LIMIT 200`,
        description: "200 microbe users for hourly pipeline testing",
    },
    {
        name: "Group B",
        file: "/tmp/cohort-group-b.txt",
        query: `SELECT email FROM user WHERE tier IN ('seed','spore') AND COALESCE(banned, 0) = 0 AND github_id IS NOT NULL ORDER BY created_at ASC LIMIT 200`,
        description:
            "200 seed/spore users (downgraded to spore at reset) for daily pipeline",
    },
    {
        name: "Group C",
        file: "/tmp/cohort-group-c.txt",
        query: `SELECT email FROM user WHERE tier = 'spore' AND COALESCE(banned, 0) = 0 AND github_id IS NOT NULL ORDER BY created_at ASC LIMIT 100 OFFSET 200`,
        description:
            "100 genuine spore users for daily pipeline (no overlap with B)",
    },
];

function main(): void {
    console.log("Building test cohort files from staging D1...\n");

    const allEmails: string[] = [];

    for (const group of GROUPS) {
        const rows = queryD1(ENV, group.query);
        const emails = rows.map((r) => String(r.email));
        writeFileSync(group.file, `${emails.join("\n")}\n`);
        console.log(`  ${group.name}: ${emails.length} users -> ${group.file}`);
        console.log(`    ${group.description}`);

        if (group.name === "Group B" || group.name === "Group C") {
            allEmails.push(...emails);
        }
    }

    // Combined daily cohort (B + C)
    const dailyFile = "/tmp/cohort-daily.txt";
    writeFileSync(dailyFile, `${allEmails.join("\n")}\n`);
    console.log(
        `\n  Daily combined (B+C): ${allEmails.length} users -> ${dailyFile}`,
    );

    console.log("\nDone. Run reset-cohort.ts before each test run.");
}

main();
