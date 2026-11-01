// Preview: npx tsx scripts/backfill-quest-restrictions.ts --env staging
// Apply after reviewing the preview: add --apply. Use --env local for local D1/KV.
// Run after migration 0079. Never modifies balances or rechecks explicitly cleared users.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
    PURCHASED_SQL,
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
const decisions = new Set(keys("decision:"));
type Candidate = {
    rowid: number;
    id: string;
    email: string;
    tier_balance: number | null;
    purchased: number;
};
type Summary = {
    accounts: number;
    restricted: number;
    cleared: number;
    quest_pollen_to_freeze: number;
};
const domains = new Map<string, Summary>();
const totals: Summary = {
    accounts: 0,
    restricted: 0,
    cleared: 0,
    quest_pollen_to_freeze: 0,
};
// A single rowid walk, bounded to accounts present at the start. No OFFSET and
// no per-domain scans. Each purchase lookup uses its existing user_id index.
const [{ last }] = query("SELECT COALESCE(max(rowid), 0) AS last FROM user");
let cursor = 0;
while (cursor < last) {
    const page = query(`SELECT rowid, id, email, tier_balance,
        CASE WHEN ${PURCHASED_SQL} THEN 1 ELSE 0 END AS purchased
        FROM user WHERE rowid > ${cursor} AND rowid <= ${last}
        AND quest_pollen_restricted IS NULL ORDER BY rowid LIMIT 1000`) as Candidate[];
    if (!page.length) break;
    cursor = page[page.length - 1].rowid;
    const ids: string[] = [];
    const approved: string[] = [];
    for (const user of page) {
        const domain = registrableDomain(user.email);
        if (!domain || !held.has(domain)) continue;
        ids.push(user.id);
        const id = user.id;
        const approvedReview =
            decisions.has(id) &&
            run([
                "kv",
                "key",
                "get",
                "--binding",
                "SETUP_HOLDS",
                `decision:${id}`,
            ]).trim() === "approved";
        if (approvedReview) approved.push(id);
        const cleared = user.purchased === 1 || approvedReview;
        const summary = domains.get(domain) ?? {
            accounts: 0,
            restricted: 0,
            cleared: 0,
            quest_pollen_to_freeze: 0,
        };
        for (const counts of [summary, totals]) {
            counts.accounts++;
            counts[cleared ? "cleared" : "restricted"]++;
            if (!cleared)
                counts.quest_pollen_to_freeze += Math.max(
                    0,
                    user.tier_balance ?? 0,
                );
        }
        domains.set(domain, summary);
    }
    // Point lookups by primary key. The UPDATE rechecks purchases and NULL so
    // a purchase/manual clear during the backfill cannot be overwritten.
    if (values.apply)
        for (let i = 0; i < ids.length; i += 200)
            query(restrictionSql(ids.slice(i, i + 200), approved));
}
for (const [domain, summary] of domains)
    console.log(JSON.stringify({ domain, ...summary }));
console.log(
    JSON.stringify({
        environment: values.env,
        applied: values.apply,
        domains: domains.size,
        ...totals,
        quest_pollen_to_freeze:
            Math.round(totals.quest_pollen_to_freeze * 1e8) / 1e8,
    }),
);
