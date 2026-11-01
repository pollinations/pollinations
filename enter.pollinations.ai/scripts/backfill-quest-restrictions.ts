// Preview: npx tsx scripts/backfill-quest-restrictions.ts --env staging
// Apply after reviewing the preview: add --apply. Use --env local for local D1/KV.
// Run after migration 0079. Never modifies balances or rechecks explicitly cleared users.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
    restrictionCandidatesSql,
    restrictionPreviewSql,
    restrictionSql,
} from "../../operations/infra-watch/src/quest-restrictions.js";
import { registrableDomain } from "../src/services/signup-domains.ts";

const { values } = parseArgs({
    options: {
        env: { type: "string" },
        apply: { type: "boolean", default: false },
    },
});
if (!values.env || !["local", "staging", "production"].includes(values.env))
    throw new Error(
        "Specify --env local, staging, or production (preview unless --apply).",
    );

const cwd = fileURLToPath(new URL("../", import.meta.url));
const wrangler = fileURLToPath(
    new URL("../../node_modules/.bin/wrangler", import.meta.url),
);
const target = [
    "--env",
    values.env,
    values.env === "local" ? "--local" : "--remote",
];
function run(args: string[]) {
    return execFileSync(wrangler, [...args, ...target], {
        cwd,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
        env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    });
}
function query(sql: string) {
    const result = JSON.parse(
        run(["d1", "execute", "DB", "--json", "--command", sql]),
    );
    if (result.some((statement: { success: boolean }) => !statement.success))
        throw new Error("D1 statement failed");
    return result.flatMap(
        (statement: { results: Record<string, unknown>[] }) =>
            statement.results,
    );
}
function keys(prefix: string): string[] {
    // Wrangler paginates the full namespace listing.
    return JSON.parse(
        run([
            "kv",
            "key",
            "list",
            "--binding",
            "SETUP_HOLDS",
            "--prefix",
            prefix,
        ]),
    ).map(({ name }: { name: string }) => name.slice(prefix.length));
}

const held = new Set(keys("hold:"));
for (const domain of keys("release:")) held.delete(domain);
// Group once so old KV entries without accounts don't cause thousands of D1 scans.
const domains = [
    ...new Set(
        query(`SELECT lower(substr(email, instr(email, '@') + 1)) AS domain
    FROM user WHERE quest_pollen_restricted IS NULL GROUP BY domain`).map(
            ({ domain }: { domain: string }) =>
                registrableDomain(`account@${domain}`),
        ),
    ),
]
    .filter((domain): domain is string => domain !== null && held.has(domain))
    .sort();
const decisions = new Set(keys("decision:"));
for (const domain of domains) {
    const approved: string[] = [];
    for (const { id } of query(restrictionCandidatesSql(domain)) as {
        id: string;
    }[]) {
        if (
            decisions.has(id) &&
            run([
                "kv",
                "key",
                "get",
                "--binding",
                "SETUP_HOLDS",
                `decision:${id}`,
            ]).trim() === "approved"
        )
            approved.push(id);
    }
    const [preview] = query(restrictionPreviewSql(domain, approved));
    console.log(
        JSON.stringify({
            environment: values.env,
            mode: values.apply ? "apply" : "preview",
            domain,
            ...preview,
        }),
    );
    if (values.apply) query(restrictionSql(domain, approved));
}
console.log(JSON.stringify({ domains: domains.length, applied: values.apply }));
