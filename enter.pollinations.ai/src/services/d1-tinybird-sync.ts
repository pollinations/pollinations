/**
 * Paged D1 export for the daily Tinybird snapshot replacement.
 *
 * GitHub Actions assembles the pages and atomically replaces each Tinybird
 * datasource. Sensitive columns are excluded here and never leave D1.
 * Each page is a separate D1 read, so the export is not a point-in-time
 * transaction and may include concurrent changes.
 */

const PAGE_SIZE = 5000;

interface TableConfig {
    datasource: string;
    query: string;
}

const TABLES = [
    {
        datasource: "d1_user",
        query: `SELECT id, name, email, email_verified, image, created_at, updated_at,
                       role, banned, ban_reason, ban_expires, github_id, github_username,
                       tier, tier_balance, pack_balance, last_tier_grant
                FROM user
                WHERE id > ?
                ORDER BY id
                LIMIT ?`,
    },
    {
        datasource: "d1_apikey",
        query: `SELECT id, name, start, prefix, user_id, refill_interval, refill_amount,
                       last_refill_at, enabled, rate_limit_enabled, rate_limit_time_window,
                       rate_limit_max, request_count, remaining, last_request, expires_at,
                       created_at, updated_at, permissions, metadata, pollen_balance,
                       byop_client_key_id
                FROM apikey
                WHERE id > ?
                ORDER BY id
                LIMIT ?`,
    },
    {
        datasource: "d1_community_model",
        query: `SELECT id, owner_user_id, name, description, upstream_model,
                       prompt_text_price, prompt_cached_price, prompt_cache_write_price,
                       prompt_audio_price, prompt_image_price, completion_text_price,
                       completion_reasoning_price, completion_audio_price,
                       disabled_at, disabled_reason, disabled_by,
                       created_at, updated_at
                FROM community_endpoint
                WHERE id > ?
                ORDER BY id
                LIMIT ?`,
    },
    {
        datasource: "d1_session",
        query: `SELECT id, expires_at, created_at, updated_at, user_agent, user_id,
                       impersonated_by
                FROM session
                WHERE id > ?
                ORDER BY id
                LIMIT ?`,
    },
    {
        datasource: "d1_account",
        query: `SELECT id, account_id, provider_id, user_id, access_token_expires_at,
                       refresh_token_expires_at, scope, created_at, updated_at
                FROM account
                WHERE id > ?
                ORDER BY id
                LIMIT ?`,
    },
] as const satisfies readonly TableConfig[];

export type D1TinybirdDatasource = (typeof TABLES)[number]["datasource"];

export const D1_TINYBIRD_DATASOURCES = TABLES.map(
    ({ datasource }) => datasource,
) as D1TinybirdDatasource[];

export function isD1TinybirdDatasource(
    value: string,
): value is D1TinybirdDatasource {
    return D1_TINYBIRD_DATASOURCES.includes(value as D1TinybirdDatasource);
}

export interface D1TinybirdPage {
    datasource: D1TinybirdDatasource;
    rows: Record<string, unknown>[];
    nextCursor: string | null;
    done: boolean;
}

export async function exportD1TinybirdPage(
    db: D1Database,
    datasource: D1TinybirdDatasource,
    cursor?: string,
): Promise<D1TinybirdPage> {
    const table = TABLES.find(
        (candidate) => candidate.datasource === datasource,
    );
    if (!table) throw new Error(`Unknown D1 datasource: ${datasource}`);

    const { results } = await db
        .prepare(table.query)
        .bind(cursor ?? "", PAGE_SIZE + 1)
        .all<Record<string, unknown>>();

    const hasMore = results.length > PAGE_SIZE;
    const rows = hasMore ? results.slice(0, PAGE_SIZE) : results;
    const lastId = rows.at(-1)?.id;

    if (hasMore && (typeof lastId !== "string" || lastId.length === 0)) {
        throw new Error(`${datasource} page did not end with a string id`);
    }

    return {
        datasource,
        rows,
        nextCursor: hasMore ? (lastId as string) : null,
        done: !hasMore,
    };
}
