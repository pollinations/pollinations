import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const HOST = "https://api.europe-west2.gcp.tinybird.co";
export const ACCOUNTS = {
    pollen: {
        id: "acct_1SrY3q7rcjS3l7tr",
        currency: "EUR",
        key: "STRIPE_API_KEY",
    },
    kofi: {
        id: "acct_1QzdqWGHtmCJlpeq",
        currency: "EUR",
        key: "STRIPE_KOFI_API_KEY",
    },
};
const categories = new Set([
    "charge",
    "refund",
    "refund_failure",
    "dispute",
    "dispute_reversal",
    "charge_failure",
    "partial_capture_reversal",
    "fee",
    "payout",
    "payout_reversal",
    "currency_conversion",
    "payout_minimum_balance_hold",
    "payout_minimum_balance_release",
]);
const id = (value) => (typeof value === "string" ? value : (value?.id ?? ""));
const stamp = (seconds) =>
    new Date(seconds * 1000).toISOString().replace("T", " ").replace("Z", "");

export function normalize(exported, stream) {
    const account = ACCOUNTS[stream];
    assert(
        account && exported.account_id === account.id,
        "Wrong Stripe account",
    );
    assert(
        Number.isInteger(exported.start) &&
            exported.start < exported.end &&
            exported.end <= Date.now() / 1000,
        "Invalid export interval",
    );
    const seen = new Set();
    return exported.rows.map((row) => {
        assert(
            /^txn_/.test(row.id) && !seen.has(row.id),
            "Duplicate or invalid Stripe transaction ID",
        );
        seen.add(row.id);
        assert(
            row.created >= exported.start && row.created < exported.end,
            "Transaction outside export interval",
        );
        assert(
            categories.has(row.reporting_category),
            `Unreviewed Stripe category: ${row.reporting_category}`,
        );
        assert(
            ["eur", "usd"].includes(row.currency.toLowerCase()),
            "Unreviewed settlement currency",
        );
        assert(
            [row.amount, row.fee, row.net].every(Number.isSafeInteger) &&
                row.net === row.amount - row.fee,
            "Invalid minor-unit amounts",
        );
        return {
            account_id: account.id,
            transaction_id: row.id,
            source_id: id(row.source),
            created: stamp(row.created),
            available_on: stamp(row.available_on ?? row.created),
            currency: row.currency.toUpperCase(),
            amount: row.amount,
            fee: row.fee,
            net: row.net,
            reporting_category: row.reporting_category,
            type: row.type ?? row.reporting_category,
            revenue_stream: stream,
        };
    });
}

// Replace matching account/time ranges, retaining other accounts and history.
// Whole-source replacement is atomic; repeated runs leave one row per Stripe ID.
export function mergeTransactions(previous, exports) {
    const merged = new Map(
        previous.map((r) => [`${r.account_id}:${r.transaction_id}`, r]),
    );
    assert(
        merged.size === previous.length,
        "Existing financial datasource has duplicate IDs",
    );
    const reviewed = new Map(merged);
    for (const { exported, stream } of exports) {
        const rows = normalize(exported, stream);
        for (const [key, row] of merged) {
            const created =
                Date.parse(`${row.created.replace(" ", "T")}Z`) / 1000;
            if (
                row.account_id === exported.account_id &&
                created >= exported.start &&
                created < exported.end
            )
                merged.delete(key);
        }
        for (const row of rows) {
            const key = `${row.account_id}:${row.transaction_id}`;
            assert(
                !merged.has(key),
                "Stripe ID moved outside the refreshed interval",
            );
            const prior = reviewed.get(key);
            merged.set(key, {
                ...row,
                classification: prior?.classification ?? "",
                evidence: prior?.evidence ?? [],
            });
        }
    }
    return [...merged.values()].sort((a, b) =>
        `${a.account_id}:${a.transaction_id}`.localeCompare(
            `${b.account_id}:${b.transaction_id}`,
        ),
    );
}

// Independent integer calculation used to compare the migration against the old summaries.
export function totals(rows) {
    const grouped = new Map();
    for (const row of rows) {
        const key = `${row.created.slice(0, 7)}:${row.revenue_stream}:${row.currency}`;
        const r = grouped.get(key) ?? {
            gross_sales: 0,
            refunds: 0,
            reversals: 0,
            stripe_fees: 0,
            payments: 0,
            refund_count: 0,
        };
        const c = row.reporting_category;
        if (c === "charge") {
            r.gross_sales += row.amount;
            r.payments++;
        }
        if (["refund", "refund_failure"].includes(c)) {
            r.refunds -= row.amount;
            if (c === "refund") r.refund_count++;
        }
        if (
            [
                "dispute",
                "dispute_reversal",
                "charge_failure",
                "partial_capture_reversal",
            ].includes(c)
        )
            r.reversals -= row.amount;
        r.stripe_fees += row.fee - (c === "fee" ? row.amount : 0);
        grouped.set(key, r);
    }
    return [...grouped].map(([key, r]) => ({
        key,
        ...r,
        net_after_fees: r.gross_sales - r.refunds - r.reversals - r.stripe_fees,
    }));
}

async function request(url, token, options = {}, preview = true) {
    if (
        preview &&
        new URL(url).origin === HOST &&
        process.env.TINYBIRD_DEPLOYMENT === "staging"
    ) {
        const target = new URL(url);
        if (!target.searchParams.has("__tb__deployment"))
            target.searchParams.set("__tb__deployment", "staging");
        url = target.toString();
    }
    const r = await fetch(url, {
        ...options,
        headers: { ...options.headers, Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(120000),
    });
    assert(r.ok, `Request failed: ${new URL(url).pathname} HTTP ${r.status}`);
    const data = await r.json();
    assert(!data.error, `API error at ${new URL(url).pathname}: ${data.error}`);
    return data;
}

export async function collect(stream, start, end, key) {
    assert(key && !key.includes("_test_"), "Live Stripe access required");
    const account = await request("https://api.stripe.com/v1/account", key);
    assert.equal(account.id, ACCOUNTS[stream]?.id, "Wrong Stripe account");
    const rows = [];
    let cursor = "";
    while (true) {
        const p = new URLSearchParams({
            limit: "100",
            "created[gte]": String(start),
            "created[lt]": String(end),
        });
        if (cursor) p.set("starting_after", cursor);
        const page = await request(
            `https://api.stripe.com/v1/balance_transactions?${p}`,
            key,
        );
        assert(
            Array.isArray(page.data) && typeof page.has_more === "boolean",
            "Invalid Stripe page",
        );
        rows.push(...page.data);
        if (!page.has_more) break;
        assert(
            page.data.length && page.data.at(-1).id !== cursor,
            "Stripe pagination did not advance",
        );
        cursor = page.data.at(-1).id;
    }
    const exported = { account_id: account.id, start, end, rows };
    normalize(exported, stream);
    return exported;
}

export async function sync(exports, token) {
    const workspace = await request(`${HOST}/v1/workspace`, token);
    assert.equal(
        workspace.name,
        "pollinations_enter_staging",
        "This sync only writes staging",
    );
    const query = async (sql) =>
        (
            await request(
                `${HOST}/v0/sql?q=${encodeURIComponent(`${sql} FORMAT JSON`)}`,
                token,
            )
        ).data;
    const previous = await query("SELECT * FROM economics_stripe_transactions");
    const previousCoverage = await query("SELECT * FROM economics_stripe_sync");
    const rows = mergeTransactions(previous, exports);
    const coverage = new Map(
        previousCoverage.map((r) => [`${r.account_id}:${r.month}`, r]),
    );
    for (const { exported, stream } of exports) {
        const first = new Date(exported.start * 1000);
        assert(
            first.getUTCDate() === 1 &&
                first.getUTCHours() === 0 &&
                first.getUTCMinutes() === 0 &&
                first.getUTCSeconds() === 0,
            "Refresh must start at a UTC month boundary",
        );
        for (let start = exported.start; start < exported.end; ) {
            const date = new Date(start * 1000);
            const end = Math.min(
                Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) /
                    1000,
                exported.end,
            );
            const month = date.toISOString().slice(0, 7);
            const row = {
                account_id: exported.account_id,
                month,
                revenue_stream: stream,
                default_currency: ACCOUNTS[stream].currency,
                coverage_end: stamp(end),
                collected_at: stamp(Math.floor(Date.now() / 1000)),
                transaction_count: exported.rows.filter(
                    (r) => r.created >= start && r.created < end,
                ).length,
                expected_account_ids: Object.values(ACCOUNTS)
                    .map((a) => a.id)
                    .sort(),
            };
            const key = `${row.account_id}:${month}`;
            assert(
                !coverage.has(key) ||
                    Date.parse(`${row.coverage_end.replace(" ", "T")}Z`) >=
                        Date.parse(
                            coverage.get(key).coverage_end.replace(" ", "T") +
                                "Z",
                        ),
                "Refusing to shorten verified coverage",
            );
            coverage.set(key, row);
            start = end;
        }
    }
    const replace = async (name, values) => {
        assert(values.length, "Refusing empty replacement");
        const body = new FormData();
        body.set(
            "ndjson",
            new Blob([values.map((v) => JSON.stringify(v)).join("\n")], {
                type: "application/x-ndjson",
            }),
            "source.ndjson",
        );
        const result = await request(
            `${HOST}/v0/datasources?name=${name}&mode=replace&format=ndjson`,
            token,
            { method: "POST", body },
        );
        assert.equal(
            result.datasource?.name,
            name,
            "Unexpected import destination",
        );
        const [count] = await query(`SELECT count() n FROM ${name}`);
        assert.equal(count.n, values.length, "Import count differs");
        const [quarantine] = await query(
            `SELECT count() n FROM ${name}_quarantine`,
        );
        assert.equal(quarantine.n, 0, "Quarantined source rows");
    };
    await replace("economics_stripe_transactions", rows);
    // Publish the collection receipt only after all financial facts are verified.
    await replace("economics_stripe_sync", [...coverage.values()]);
    return { transactions: rows.length, accountMonths: coverage.size };
}

// The sales join needs charge identity only. Never mirror customer details or
// the full production webhook payload into staging.
export function enterIdentityEvent(event) {
    assert(event.event_id && event.charge_id, "Missing Enter payment identity");
    assert(
        ["charge.succeeded", "payment_intent.succeeded"].includes(
            event.event_type,
        ),
        "Unsupported Enter event type",
    );
    return {
        timestamp: event.timestamp,
        event_type: event.event_type,
        event_id: event.event_id,
        livemode: 1,
        payload: JSON.stringify({
            data: {
                object:
                    event.event_type === "charge.succeeded"
                        ? { id: event.charge_id }
                        : { latest_charge: event.charge_id },
            },
        }),
    };
}
export async function syncEnter(start, end, readToken, writeToken) {
    assert(
        Number.isInteger(start) && Number.isInteger(end) && start < end,
        "Invalid Enter range",
    );
    const source = await request(`${HOST}/v1/workspace`, readToken, {}, false);
    const destination = await request(`${HOST}/v1/workspace`, writeToken);
    assert.equal(
        source.name,
        "pollinations_enter",
        "Enter history must come from the production read credential",
    );
    assert.equal(
        destination.name,
        "pollinations_enter_staging",
        "Enter history mirror only writes staging",
    );
    const query = async (sql, token) =>
        (
            await request(
                `${HOST}/v0/sql?q=${encodeURIComponent(`${sql} FORMAT JSON`)}`,
                token,
                {},
                token !== readToken,
            )
        ).data;
    const existing = await query(
        "SELECT DISTINCT event_id FROM stripe_event WHERE livemode = 1",
        writeToken,
    );
    const known = new Set(existing.map((row) => row.event_id));
    // UTC bounds limit the read; only the identity fields cross into staging.
    const events = await query(
        `SELECT timestamp, event_type, event_id, livemode, if(event_type = 'charge.succeeded', JSONExtractString(payload, 'data', 'object', 'id'), JSONExtractString(payload, 'data', 'object', 'latest_charge')) AS charge_id FROM stripe_event WHERE livemode = 1 AND event_type IN ('charge.succeeded', 'payment_intent.succeeded') AND timestamp >= toDateTime(${start}) AND timestamp < toDateTime(${end}) ORDER BY timestamp`,
        readToken,
    );
    const added = [];
    for (const event of events) {
        assert(
            event.event_id &&
                event.livemode === 1 &&
                ["charge.succeeded", "payment_intent.succeeded"].includes(
                    event.event_type,
                ),
            "Invalid Enter source event",
        );
        if (!known.has(event.event_id)) {
            known.add(event.event_id);
            added.push(enterIdentityEvent(event));
        }
    }
    for (let offset = 0; offset < added.length; offset += 250) {
        const batch = added.slice(offset, offset + 250);
        const result = await request(
            `${HOST}/v0/events?name=stripe_event&wait=true`,
            writeToken,
            {
                method: "POST",
                headers: { "Content-Type": "application/x-ndjson" },
                body: batch.map((row) => JSON.stringify(row)).join("\n"),
            },
        );
        assert.equal(
            result.successful_rows,
            batch.length,
            "Enter event import count differs",
        );
        assert.equal(
            result.quarantined_rows ?? 0,
            0,
            "Quarantined Enter events",
        );
    }
    return { sourceEvents: events.length, importedEvents: added.length };
}

async function main() {
    const [stream, from, to, ...flags] = process.argv.slice(2);
    assert(
        ACCOUNTS[stream] && /^\d{4}-\d{2}-01$/.test(from ?? ""),
        "Usage: stripe-sync.mjs pollen|kofi YYYY-MM-01 YYYY-MM-DD|now [--write] [--export=PATH]",
    );
    const start = Date.parse(`${from}T00:00:00Z`) / 1000;
    const end =
        to === "now"
            ? Math.floor(Date.now() / 1000)
            : Date.parse(`${to}T00:00:00Z`) / 1000;
    assert(
        Number.isFinite(start) &&
            Number.isFinite(end) &&
            end > start &&
            end <= Date.now() / 1000,
        "Invalid dates",
    );
    const exported = await collect(
        stream,
        start,
        end,
        process.env[ACCOUNTS[stream].key],
    );
    const output = flags.find((f) => f.startsWith("--export="))?.slice(9);
    if (output)
        await writeFile(output, JSON.stringify(exported), { mode: 0o600 });
    console.log(
        JSON.stringify({
            stream,
            transactions: exported.rows.length,
            start,
            end,
        }),
    );
    if (flags.includes("--write")) {
        if (process.env.TINYBIRD_PROD_READ_TOKEN && stream === "pollen")
            console.log(
                await syncEnter(
                    start,
                    end,
                    process.env.TINYBIRD_PROD_READ_TOKEN,
                    process.env.TINYBIRD_STRIPE_SYNC_TOKEN,
                ),
            );
        console.log(
            await sync(
                [{ exported, stream }],
                process.env.TINYBIRD_STRIPE_SYNC_TOKEN,
            ),
        );
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
    main().catch((e) => {
        console.error(e.message);
        process.exitCode = 1;
    });
