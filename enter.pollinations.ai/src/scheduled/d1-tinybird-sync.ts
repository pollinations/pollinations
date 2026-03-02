/**
 * D1 → Tinybird sync.
 *
 * Snapshots the D1 auth tables (user, apikey, session, account) into Tinybird
 * datasources. Sensitive columns (tokens, keys, passwords, IPs) are excluded
 * at the SQL level — they never leave D1.
 *
 * Triggered daily via GitHub Actions calling POST /api/admin/trigger-d1-sync.
 */

const TINYBIRD_BASE_URL = "https://api.europe-west2.gcp.tinybird.co";
const MAX_RETRIES = 3;

interface TableConfig {
    /** Tinybird datasource name */
    datasource: string;
    /** SQL query — only safe columns, never SELECT * */
    query: string;
}

const TABLES: TableConfig[] = [
    {
        datasource: "d1_user",
        query: `SELECT id, name, email, email_verified, image, created_at, updated_at,
                       role, banned, ban_reason, ban_expires, github_id, github_username,
                       tier, tier_balance, pack_balance, crypto_balance, last_tier_grant
                FROM user`,
    },
    {
        datasource: "d1_apikey",
        query: `SELECT id, name, start, prefix, user_id, refill_interval, refill_amount,
                       last_refill_at, enabled, rate_limit_enabled, rate_limit_time_window,
                       rate_limit_max, request_count, remaining, last_request, expires_at,
                       created_at, updated_at, permissions, metadata, pollen_balance
                FROM apikey`,
    },
    {
        datasource: "d1_session",
        query: `SELECT id, expires_at, created_at, updated_at, user_agent, user_id,
                       impersonated_by
                FROM session`,
    },
    {
        datasource: "d1_account",
        query: `SELECT id, account_id, provider_id, user_id, access_token_expires_at,
                       refresh_token_expires_at, scope, created_at, updated_at
                FROM account`,
    },
];

/** Truncate a Tinybird datasource. Requires DATASOURCES:CREATE token scope. */
async function truncateDatasource(
    datasource: string,
    token: string,
): Promise<void> {
    const url = `${TINYBIRD_BASE_URL}/v0/datasources/${datasource}/truncate`;
    const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(
            `Truncate ${datasource} failed (${res.status}): ${body}`,
        );
    }
}

/** Append NDJSON rows to a Tinybird datasource via the Events API. */
async function appendRows(
    datasource: string,
    token: string,
    ndjson: string,
): Promise<void> {
    const url = `${TINYBIRD_BASE_URL}/v0/events?name=${datasource}&wait=true`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/x-ndjson",
            },
            body: ndjson,
        });

        if (res.ok) return;

        const body = await res.text();
        const retryable = res.status >= 500 || res.status === 429;

        if (!retryable || attempt === MAX_RETRIES) {
            throw new Error(
                `Append ${datasource} failed (${res.status}): ${body}`,
            );
        }

        // Exponential backoff: 200ms, 400ms, 800ms
        await new Promise((r) => setTimeout(r, 200 * 2 ** (attempt - 1)));
    }
}

/** Convert D1 result rows to NDJSON string with synced_at timestamp. */
function toNdjson(rows: Record<string, unknown>[]): string {
    const syncedAt = new Date()
        .toISOString()
        .replace("T", " ")
        .replace(/\.\d+Z$/, "");

    return rows
        .map((row) => JSON.stringify({ ...row, synced_at: syncedAt }))
        .join("\n");
}

interface SyncResult {
    datasource: string;
    rows: number;
    status: "ok" | "error";
    error?: string;
}

/**
 * Run the D1 → Tinybird sync for all tables.
 * Returns per-table results for the HTTP response.
 */
export async function runD1TinybirdSync(
    db: D1Database,
    tinybirdSyncToken: string,
): Promise<SyncResult[]> {
    const results: SyncResult[] = [];

    for (const table of TABLES) {
        try {
            const { results: rows } = await db.prepare(table.query).all();

            console.log(
                `D1→Tinybird sync: ${table.datasource} — ${rows.length} rows`,
            );

            await truncateDatasource(table.datasource, tinybirdSyncToken);

            if (rows.length > 0) {
                const ndjson = toNdjson(rows);
                await appendRows(table.datasource, tinybirdSyncToken, ndjson);
            }

            console.log(`D1→Tinybird sync: ${table.datasource} — done`);
            results.push({
                datasource: table.datasource,
                rows: rows.length,
                status: "ok",
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(
                `D1→Tinybird sync: ${table.datasource} — error:`,
                message,
            );
            results.push({
                datasource: table.datasource,
                rows: 0,
                status: "error",
                error: message,
            });
        }
    }

    return results;
}
