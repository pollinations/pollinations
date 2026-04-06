import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parse as parseCsv } from "csv-parse/sync";
import { stringify as stringifyCsv } from "csv-stringify/sync";

export const LEDGER_PATH = "src/tier-progression/abuse-ledger.csv";

export const LEDGER_COLUMNS = [
    "id",
    "email",
    "github_username",
    "tier",
    "created_at_ts",
    "run_id",
    "cohort",
    "cohort_added_at",
    "llm_checked_at",
    "llm_status",
    "llm_score",
    "llm_signals",
    "llm_action",
    "purchase_checked_at",
    "has_paid_purchase",
    "usage_checked_at",
    "request_count",
    "error_rate_pct",
    "ip_checked_at",
    "ip_hash_peer_ids_in_run",
    "subnet_peer_ids_in_run",
    "downgrade_action",
    "downgrade_reason",
    "decided_at",
    "last_applied_at",
    "manual_action",
    "manual_note",
] as const;

export type LedgerColumn = (typeof LEDGER_COLUMNS)[number];
export type AbuseLedgerRow = Record<LedgerColumn, string>;

const RUN_STATE_COLUMNS: LedgerColumn[] = [
    "llm_checked_at",
    "llm_status",
    "llm_score",
    "llm_signals",
    "llm_action",
    "purchase_checked_at",
    "has_paid_purchase",
    "usage_checked_at",
    "request_count",
    "error_rate_pct",
    "ip_checked_at",
    "ip_hash_peer_ids_in_run",
    "subnet_peer_ids_in_run",
    "downgrade_action",
    "downgrade_reason",
    "decided_at",
];

export function nowIso(): string {
    return new Date().toISOString();
}

export function buildTierCohort(tier: string): string {
    return `tier:${tier}`;
}

export function createEmptyLedgerRow(): AbuseLedgerRow {
    return Object.fromEntries(
        LEDGER_COLUMNS.map((column) => [column, ""]),
    ) as AbuseLedgerRow;
}

export function normalizeLedgerRow(
    row: Partial<Record<string, unknown>>,
): AbuseLedgerRow {
    const normalized = createEmptyLedgerRow();
    for (const column of LEDGER_COLUMNS) {
        const value = row[column];
        normalized[column] =
            value === undefined || value === null ? "" : String(value);
    }
    return normalized;
}

export function loadLedger(path = LEDGER_PATH): AbuseLedgerRow[] {
    const resolvedPath = resolve(path);
    if (!existsSync(resolvedPath)) return [];

    const content = readFileSync(resolvedPath, "utf-8");
    if (!content.trim()) return [];

    const rows = parseCsv(content, {
        bom: true,
        columns: true,
        skip_empty_lines: true,
    }) as Array<Record<string, unknown>>;

    return rows.map(normalizeLedgerRow);
}

export function saveLedger(rows: AbuseLedgerRow[], path = LEDGER_PATH): void {
    const resolvedPath = resolve(path);
    mkdirSync(dirname(resolvedPath), { recursive: true });

    const csv = stringifyCsv(rows.map(normalizeLedgerRow), {
        header: true,
        columns: [...LEDGER_COLUMNS],
    });

    writeFileSync(resolvedPath, csv);
}

export function getLatestRunId(
    rows: AbuseLedgerRow[],
    cohort?: string,
): string | null {
    const runIds = rows
        .filter((row) => row.run_id && (!cohort || row.cohort === cohort))
        .map((row) => row.run_id)
        .sort();

    return runIds.at(-1) ?? null;
}

export function requireRunId(
    rows: AbuseLedgerRow[],
    explicitRunId?: string,
    cohort?: string,
): string {
    if (explicitRunId) return explicitRunId;

    const latestRunId = getLatestRunId(rows, cohort);
    if (!latestRunId) {
        throw new Error(
            cohort
                ? `No runs found in ledger for cohort ${cohort}`
                : "No runs found in ledger",
        );
    }

    return latestRunId;
}

export function parseSemicolonList(value: string): string[] {
    return value
        .split(";")
        .map((entry) => entry.trim())
        .filter(Boolean);
}

export function formatSemicolonList(values: Iterable<string>): string {
    return [...new Set(values)].sort().join(";");
}

export function formatRegisteredAt(timestampSeconds: number): string {
    const date = new Date(timestampSeconds * 1000);
    return date.toISOString().slice(0, 16).replace("T", " ");
}

export function parseTimestampSeconds(value: string): number | null {
    if (!value) return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

export function parseTinybirdDateTime(value: string): number | null {
    if (!value) return null;
    const normalized = value.includes("T")
        ? value
        : `${value.replace(" ", "T")}Z`;
    const parsed = Date.parse(normalized);
    return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
}

export function escapeSqlString(value: string): string {
    return value.replace(/'/g, "''");
}

export function loadTinybirdToken(): string {
    if (process.env.TINYBIRD_TOKEN) return process.env.TINYBIRD_TOKEN;

    const tinybirdPath = resolve("observability/.tinyb");
    if (existsSync(tinybirdPath)) {
        const config = JSON.parse(readFileSync(tinybirdPath, "utf-8")) as {
            token?: string;
        };
        if (config.token) return config.token;
    }

    throw new Error(
        "No Tinybird token found. Set TINYBIRD_TOKEN or ensure observability/.tinyb exists.",
    );
}

export function loadTinybirdHost(): string {
    const tinybirdPath = resolve("observability/.tinyb");
    if (existsSync(tinybirdPath)) {
        const config = JSON.parse(readFileSync(tinybirdPath, "utf-8")) as {
            host?: string;
        };
        if (config.host) return config.host;
    }

    return "https://api.europe-west2.gcp.tinybird.co";
}

export async function queryTinybirdSql<T>(
    sql: string,
    host = loadTinybirdHost(),
    token = loadTinybirdToken(),
): Promise<T[]> {
    const response = await fetch(`${host}/v0/sql`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `q=${encodeURIComponent(sql)}`,
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(
            `Tinybird query failed: ${response.status} ${body.slice(0, 300)}`,
        );
    }

    const result = (await response.json()) as { data?: T[] };
    return result.data ?? [];
}

export function loadRemoteApiKey(): string {
    const tokenFile = ".testingtokens";
    if (!existsSync(tokenFile)) {
        throw new Error(
            "No .testingtokens file found. Add ENTER_API_TOKEN_REMOTE to run the LLM enricher.",
        );
    }

    const content = readFileSync(tokenFile, "utf-8");
    const match = content.match(/ENTER_API_TOKEN_REMOTE=([^\n]+)/);
    if (!match) {
        throw new Error("No ENTER_API_TOKEN_REMOTE found in .testingtokens");
    }

    return match[1].trim();
}

export function resetRunState(
    row: AbuseLedgerRow,
    runId: string,
    cohort: string,
    cohortAddedAt: string,
): AbuseLedgerRow {
    const next = normalizeLedgerRow(row);
    next.run_id = runId;
    next.cohort = cohort;
    next.cohort_added_at = cohortAddedAt;

    for (const column of RUN_STATE_COLUMNS) {
        next[column] = "";
    }

    return next;
}
