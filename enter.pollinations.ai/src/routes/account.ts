import type { Logger } from "@logtape/logtape";
import {
    type ApiKeyType,
    createApiKeyForUser,
} from "@shared/auth/api-key-creation.ts";
import { isCommunityEndpointOwnerAllowed } from "@shared/community-endpoints.ts";
import * as schema from "@shared/db/better-auth.ts";
import {
    apikey as apikeyTable,
    rewards as rewardsTable,
    user as userTable,
} from "@shared/db/better-auth.ts";
import { validator } from "@shared/middleware/validator.ts";
import { getTierCadence, tierNames } from "@shared/tier-config.ts";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Context } from "hono";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import { QUEST_CATEGORIES } from "../services/quests/definitions.ts";
import { listQuestCards } from "../services/quests/index.ts";
import {
    fetchTinybirdRows,
    requireTinybirdReadToken,
} from "../services/tinybird.ts";
import {
    hasAccountReadPermission,
    hasDirectAccountPermission,
} from "./account-permissions.ts";
import { communityEndpointsRoutes } from "./community-endpoints.ts";
import { parseMetadata } from "./metadata-utils.ts";

// Calculate next tier refill time (null for tiers with no refill).
// Matches the `0 * * * *` cron in wrangler.toml — top of the next UTC hour.
function getNextRefillAt(tier?: string | null): string | null {
    const cadence = tier ? getTierCadence(tier) : "none";
    if (cadence === "none") return null;
    const next = new Date();
    next.setUTCMinutes(0, 0, 0);
    next.setUTCHours(next.getUTCHours() + 1);
    return next.toISOString();
}

// Cache TTL in seconds
const CACHE_TTL = 60 * 60; // 1 hour
const DEFAULT_USAGE_DAYS = 30;
const DEFAULT_DAILY_USAGE_DAYS = 90;
const MAX_USAGE_DAYS = 90;
const USAGE_CHUNK_DAYS = 30;
const MAX_USAGE_EXPORT_ROWS = 50_000;

const SECONDS_PER_DAY = 86400;
const USAGE_MIN_DATE = "2026-01-01";
const PERIOD_GRANULARITIES = ["day", "week", "month"] as const;
type PeriodGranularity = (typeof PERIOD_GRANULARITIES)[number];

type UsageDebugBindings = CloudflareBindings & {
    USAGE_DEBUG_USER_ID?: string;
};

export function resolveUsageTargetUserId(
    env: CloudflareBindings,
    currentUserId: string,
    apiKey?: {
        permissions?: Record<string, string[]>;
        metadata?: Record<string, unknown>;
    },
): { userId: string; overridden: boolean } {
    if (apiKey) {
        return { userId: currentUserId, overridden: false };
    }

    const environment = String(env.ENVIRONMENT || "");
    const allowDebugOverride =
        environment === "local" ||
        environment === "development" ||
        environment === "dev";

    if (!allowDebugOverride) {
        return { userId: currentUserId, overridden: false };
    }

    const debugUserId = (env as UsageDebugBindings).USAGE_DEBUG_USER_ID?.trim();
    if (!debugUserId) {
        return { userId: currentUserId, overridden: false };
    }

    return {
        userId: debugUserId,
        overridden: debugUserId !== currentUserId,
    };
}

/**
 * Require that the caller has `account:keys` permission.
 * Session-authenticated users (no apiKey) are always allowed.
 */
function requireKeysPermission(apiKey?: {
    permissions?: Record<string, string[]>;
    metadata?: Record<string, unknown>;
}): void {
    if (!apiKey) return; // session auth — always allowed
    if (!hasDirectAccountPermission(apiKey, "keys")) {
        throw new HTTPException(403, {
            message: "API key does not have 'account:keys' permission",
        });
    }
}

function requireUsagePermission(apiKey?: {
    permissions?: Record<string, string[]>;
    metadata?: Record<string, unknown>;
}): void {
    if (apiKey && !hasAccountReadPermission(apiKey, "usage")) {
        throw new HTTPException(403, {
            message: "API key does not have 'account:usage' permission",
        });
    }
}

// Schema for creating an API key via the API
const CreateKeySchema = z.object({
    name: z.string().min(1).max(253).describe("Name for the API key"),
    type: z
        .enum(["secret", "publishable"])
        .optional()
        .default("secret")
        .describe(
            "Key type: secret (sk_) or publishable app key (pk_). Use publishable to create an app key.",
        ),
    expiresIn: z
        .number()
        .int()
        .positive()
        .max(365 * SECONDS_PER_DAY)
        .optional()
        .describe("Expiry in seconds from now (max 365 days)"),
    allowedModels: z
        .array(z.string())
        .nullable()
        .optional()
        .describe("Model IDs this key can access. null = all models"),
    pollenBudget: z
        .number()
        .nullable()
        .optional()
        .describe("Pollen budget cap. null = unlimited"),
    accountPermissions: z
        .array(z.string())
        .nullable()
        .optional()
        .describe(
            'Account permissions (e.g. ["usage"]). "keys" is auto-stripped.',
        ),
    redirectUris: z
        .array(z.string())
        .optional()
        .describe(
            "Allowed OAuth redirect URIs for publishable app keys. Required for OAuth app flows. Must be https:// except http:// loopback URIs for local apps. Matching pins scheme, host, port, and path; one trailing slash is ignored. If the registered URI has no query, incoming query params are allowed; if it has a query, the query must match exactly. Loopback ports are matched port-agnostically.",
        ),
    earningsEnabled: z
        .boolean()
        .optional()
        .describe(
            "Enable developer earnings for publishable app keys. Defaults to false; send true to opt in.",
        ),
});

// CSV escape helper
const escapeCSV = (val: string | number | boolean | null) => {
    if (val === null || val === undefined) return "";
    const raw = String(val);
    const str = /^[\t\r\n]|^\s*[=+\-@]/.test(raw) ? `'${raw}` : raw;
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

function formatTinybirdDateTime(date: Date): string {
    return date.toISOString().slice(0, 19).replace("T", " ");
}

function startOfNextUtcDay(now = new Date()): Date {
    const next = new Date(now);
    next.setUTCHours(0, 0, 0, 0);
    next.setUTCDate(next.getUTCDate() + 1);
    return next;
}

function addUtcDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
}

type UsageWindow = {
    since: string;
    until: string;
};

type UsageWindowDates = {
    sinceDate: Date;
    untilDate: Date;
};

type UsagePeriod = {
    granularity?: PeriodGranularity;
    period?: string;
};

function formatUsageWindow(window: UsageWindowDates): UsageWindow {
    return {
        since: formatTinybirdDateTime(window.sinceDate),
        until: formatTinybirdDateTime(window.untilDate),
    };
}

function buildUsageWindow(days: number): UsageWindowDates {
    const untilDate = startOfNextUtcDay();
    const sinceDate = addUtcDays(untilDate, -days);
    return { sinceDate, untilDate };
}

function startOfUtcDay(year: number, monthIndex: number, day: number): Date {
    return new Date(Date.UTC(year, monthIndex, day, 0, 0, 0, 0));
}

function usageMinDate(): Date {
    return new Date(`${USAGE_MIN_DATE}T00:00:00.000Z`);
}

function parseUtcDayPeriod(period: string): UsageWindowDates | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(period);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const sinceDate = startOfUtcDay(year, month - 1, day);
    if (
        sinceDate.getUTCFullYear() !== year ||
        sinceDate.getUTCMonth() !== month - 1 ||
        sinceDate.getUTCDate() !== day
    ) {
        return null;
    }
    return { sinceDate, untilDate: addUtcDays(sinceDate, 1) };
}

function parseUtcMonthPeriod(period: string): UsageWindowDates | null {
    const match = /^(\d{4})-(\d{2})$/.exec(period);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const sinceDate = startOfUtcDay(year, month - 1, 1);
    if (
        sinceDate.getUTCFullYear() !== year ||
        sinceDate.getUTCMonth() !== month - 1
    ) {
        return null;
    }
    const untilDate = startOfUtcDay(year, month, 1);
    return { sinceDate, untilDate };
}

function parseUtcWeekPeriod(period: string): UsageWindowDates | null {
    const match = /^(\d{4})-W(\d{2})$/.exec(period);
    if (!match) return null;
    const isoYear = Number(match[1]);
    const isoWeek = Number(match[2]);
    if (isoWeek < 1 || isoWeek > 53) return null;

    // ISO week 1 is the week containing Jan 4. Weeks start on Monday.
    const jan4 = startOfUtcDay(isoYear, 0, 4);
    const jan4Day = jan4.getUTCDay() || 7;
    const weekOneMonday = addUtcDays(jan4, 1 - jan4Day);
    const sinceDate = addUtcDays(weekOneMonday, (isoWeek - 1) * 7);

    if (getUtcIsoWeekPeriod(sinceDate) !== period) return null;

    return { sinceDate, untilDate: addUtcDays(sinceDate, 7) };
}

function getUtcIsoWeekPeriod(date: Date): string {
    const utcDate = startOfUtcDay(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
    );
    const day = utcDate.getUTCDay() || 7;
    const thursday = addUtcDays(utcDate, 4 - day);
    const isoYear = thursday.getUTCFullYear();
    const yearStart = startOfUtcDay(isoYear, 0, 1);
    const isoWeek = Math.ceil(
        ((thursday.getTime() - yearStart.getTime()) / (SECONDS_PER_DAY * 1000) +
            1) /
            7,
    );
    return `${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
}

function buildUsageWindowFromPeriod({
    granularity,
    period,
}: UsagePeriod): UsageWindowDates | null {
    if (!granularity || !period) return null;

    if (granularity === "day") return parseUtcDayPeriod(period);
    if (granularity === "week") return parseUtcWeekPeriod(period);
    if (granularity === "month") return parseUtcMonthPeriod(period);

    granularity satisfies never;
    return null;
}

function resolveUsageWindow(
    days: number,
    period: UsagePeriod,
): UsageWindowDates {
    const hasPeriodParam = period.granularity || period.period;
    const usageWindow = buildUsageWindowFromPeriod(period);
    if (hasPeriodParam && !usageWindow) {
        throw new HTTPException(400, {
            message:
                "Invalid usage period. Use granularity=day&period=YYYY-MM-DD, granularity=week&period=YYYY-WNN, or granularity=month&period=YYYY-MM.",
        });
    }
    if (usageWindow) {
        const now = new Date();
        const today = startOfUtcDay(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
        );
        if (
            usageWindow.untilDate <= usageMinDate() ||
            usageWindow.sinceDate > today
        ) {
            throw new HTTPException(400, {
                message: `Usage period must overlap ${USAGE_MIN_DATE} through today.`,
            });
        }
    }
    return usageWindow || buildUsageWindow(days);
}

function usageWindowFilenamePart(days: number, period: UsagePeriod): string {
    return period.granularity && period.period
        ? `${period.granularity}-${period.period}`
        : `${days}d`;
}

function buildUsageWindows(
    days: number,
    period: UsagePeriod = {},
    chunkDays = USAGE_CHUNK_DAYS,
    newestFirst = false,
): UsageWindow[] {
    const overallWindow = resolveUsageWindow(days, period);
    const windows: UsageWindow[] = [];
    let cursor = overallWindow.sinceDate;
    const end = overallWindow.untilDate;

    while (cursor < end) {
        const next = addUtcDays(cursor, chunkDays);
        const boundedNext = next < end ? next : end;
        windows.push(
            formatUsageWindow({ sinceDate: cursor, untilDate: boundedNext }),
        );
        cursor = boundedNext;
    }

    return newestFirst ? windows.reverse() : windows;
}

function parseCommaSeparatedQueryList(value?: string): string[] {
    return value
        ? Array.from(
              new Set(
                  value
                      .split(",")
                      .map((id) => id.trim())
                      .filter((id) => id.length > 0),
              ),
          ).sort()
        : [];
}

const commaSeparatedQueryList = z
    .string()
    .optional()
    .transform(parseCommaSeparatedQueryList);
// Query params schema for usage
const usageQuerySchema = z.object({
    format: z.enum(["json", "csv"]).optional().default("json"),
    limit: z.coerce
        .number()
        .min(1)
        .max(MAX_USAGE_EXPORT_ROWS)
        .optional()
        .default(100),
    before: z.string().optional(), // ISO timestamp cursor for pagination
    before_event_id: z.string().optional(), // Stable tie-breaker for same-second timestamps
    days: z.coerce
        .number()
        .int()
        .min(1)
        .max(MAX_USAGE_DAYS)
        .optional()
        .default(DEFAULT_USAGE_DAYS),
    granularity: z.enum(PERIOD_GRANULARITIES).optional(),
    period: z.string().optional(),
    api_key_ids: commaSeparatedQueryList,
    models: commaSeparatedQueryList,
});

// Query params schema for daily usage
const usageDailyQuerySchema = z.object({
    format: z.enum(["json", "csv"]).optional().default("json"),
    days: z.coerce
        .number()
        .int()
        .min(1)
        .max(MAX_USAGE_DAYS)
        .optional()
        .default(DEFAULT_DAILY_USAGE_DAYS),
    granularity: z.enum(PERIOD_GRANULARITIES).optional(),
    period: z.string().optional(),
    api_key_ids: commaSeparatedQueryList,
});

const earningsQuerySchema = usageDailyQuerySchema.extend({
    entity_ids: commaSeparatedQueryList,
});

type DailyUsageRecord = {
    date: string;
    model: string | null;
    meter_source: string | null;
    requests: number;
    cost_usd: number;
};

type UsageRecord = {
    timestamp: string;
    type: string;
    model: string | null;
    api_key_id: string | null;
    api_key: string | null;
    api_key_type: string | null;
    meter_source: string | null;
    input_text_tokens: number;
    input_cached_tokens: number;
    input_audio_tokens: number;
    input_audio_seconds: number;
    input_image_tokens: number;
    output_text_tokens: number;
    output_reasoning_tokens: number;
    output_audio_tokens: number;
    output_audio_seconds: number;
    output_image_tokens: number;
    output_video_seconds: number;
    cost_usd: number;
    response_time_ms: number | null;
};

type UsageRecordWithCursor = UsageRecord & {
    cursor_event_id: string;
};

// Response schema for daily usage OpenAPI documentation
const dailyUsageRecordSchema = z.object({
    date: z.string().describe("Date (YYYY-MM-DD format)"),
    model: z.string().nullable().describe("Model used"),
    meter_source: z
        .string()
        .nullable()
        .describe(
            "Billing source: 'tier' = tier balance, 'pack' = paid balance",
        ),
    requests: z.number().describe("Number of requests"),
    cost_usd: z.number().describe("Total cost in USD"),
});

const dailyUsageResponseSchema = z.object({
    usage: z
        .array(dailyUsageRecordSchema)
        .describe("Array of daily usage records"),
    count: z.number().describe("Number of records returned"),
});

function sortDailyUsageRecords(usage: DailyUsageRecord[]): DailyUsageRecord[] {
    return usage.toSorted((left, right) => {
        if (left.date !== right.date) {
            return right.date.localeCompare(left.date);
        }
        if (right.requests !== left.requests) {
            return right.requests - left.requests;
        }
        if ((left.model || "") !== (right.model || "")) {
            return (left.model || "").localeCompare(right.model || "");
        }
        return (left.meter_source || "").localeCompare(
            right.meter_source || "",
        );
    });
}

const USAGE_CSV_HEADER =
    "timestamp,type,model,api_key,api_key_type,meter_source,input_text_tokens,input_cached_tokens,input_audio_tokens,input_audio_seconds,input_image_tokens,output_text_tokens,output_reasoning_tokens,output_audio_tokens,output_audio_seconds,output_image_tokens,output_video_seconds,cost_usd,response_time_ms";

function usageRecordToCsvRow(row: UsageRecord): string {
    return `${escapeCSV(row.timestamp)},${escapeCSV(row.type)},${escapeCSV(row.model)},${escapeCSV(row.api_key)},${escapeCSV(row.api_key_type)},${escapeCSV(row.meter_source)},${row.input_text_tokens},${row.input_cached_tokens},${row.input_audio_tokens},${row.input_audio_seconds},${row.input_image_tokens},${row.output_text_tokens},${row.output_reasoning_tokens},${row.output_audio_tokens},${row.output_audio_seconds},${row.output_image_tokens},${row.output_video_seconds},${row.cost_usd},${escapeCSV(row.response_time_ms)}`;
}

function dailyUsageRecordToCsvRow(row: DailyUsageRecord): string {
    return `${escapeCSV(row.date)},${escapeCSV(row.model)},${escapeCSV(row.meter_source)},${row.requests},${row.cost_usd}`;
}

type DeveloperEarningsRow = {
    date: string;
    entity_id: string;
    entity_name: string;
    source: "byop_markup" | "community_model";
    requests: number;
    baseline_price: number;
    pollen_earned: number;
    paid_earned: number;
    tier_earned: number;
    cost_usd: number;
    reward_rate: number;
    unique_users: number;
};

type DeveloperEarningsTotal = {
    pollen_earned: number;
    paid_earned: number;
    tier_earned: number;
};

const developerEarningsRowSchema = z.object({
    date: z
        .string()
        .describe(
            "Date bucket (YYYY-MM-DD or hourly); empty string on rollup rows",
        ),
    entity_id: z
        .string()
        .describe(
            "Earning entity id (BYOP app key or community model); empty string on source rollup rows",
        ),
    entity_name: z.string().describe("Earning entity display name"),
    source: z
        .enum(["byop_markup", "community_model"])
        .describe("Reward source, such as byop_markup or community_model"),
    requests: z.number().describe("Number of billed requests"),
    baseline_price: z
        .number()
        .describe("Model cost before markup (sum over the bucket)"),
    pollen_earned: z
        .number()
        .describe("Developer credit earned over the bucket"),
    paid_earned: z
        .number()
        .describe("Developer credit earned from paid-balance spend"),
    tier_earned: z
        .number()
        .describe("Developer credit earned from tier-balance spend"),
    cost_usd: z
        .number()
        .describe(
            "Reward basis total for the bucket; BYOP rows use payer charge, community model rows use model price",
        ),
    reward_rate: z.number().describe("Average reward or markup rate applied"),
    unique_users: z
        .number()
        .describe(
            "Distinct end-users who paid. Always 0 on daily/hourly bucket rows by design — meaningful only on rollup rows (where date='').",
        ),
});

const developerEarningsTotalSchema = z.object({
    pollen_earned: z
        .number()
        .describe("Total developer credit earned across earning sources"),
    paid_earned: z
        .number()
        .describe("Total developer credit earned from paid-balance spend"),
    tier_earned: z
        .number()
        .describe("Total developer credit earned from tier-balance spend"),
});

const developerEarningsResponseSchema = z.object({
    daily: z
        .array(developerEarningsRowSchema)
        .describe("Per-(date, earning entity) buckets for the period"),
    perEntity: z
        .array(developerEarningsRowSchema)
        .describe("Per-earning-entity rollups for the period"),
    bySource: z
        .array(developerEarningsRowSchema)
        .describe(
            "Per-source rollups for the period. Source-specific request, user, basis, and rate metrics are meaningful here.",
        ),
    total: developerEarningsTotalSchema.describe(
        "Additive money totals across all earning sources. Non-additive metrics such as requests, users, basis, and rates are intentionally source-specific.",
    ),
});

function dailyEarningsRowToCsvRow(row: DeveloperEarningsRow): string {
    return `${escapeCSV(row.date)},${escapeCSV(row.source)},${escapeCSV(row.entity_id)},${escapeCSV(row.entity_name)},${row.requests},${row.baseline_price},${row.pollen_earned},${row.paid_earned},${row.tier_earned},${row.cost_usd},${row.reward_rate}`;
}

function totalDeveloperEarnings(
    rows: DeveloperEarningsRow[],
): DeveloperEarningsTotal {
    return rows.reduce(
        (total, row) => ({
            pollen_earned: total.pollen_earned + row.pollen_earned,
            paid_earned: total.paid_earned + row.paid_earned,
            tier_earned: total.tier_earned + row.tier_earned,
        }),
        { pollen_earned: 0, paid_earned: 0, tier_earned: 0 },
    );
}

async function fetchDetailedUsagePage(
    origin: string,
    token: string,
    params: {
        userId: string;
        apiKeyId?: string;
        apiKeyIds?: string[];
        models?: string[];
        limit: number;
        since: string;
        until: string;
        before?: string;
        beforeEventId?: string;
    },
): Promise<UsageRecordWithCursor[]> {
    return fetchTinybirdRows<UsageRecordWithCursor>(
        origin,
        "/v0/pipes/user_usage.json",
        token,
        {
            user_id: params.userId,
            api_key_id: params.apiKeyId,
            api_key_ids:
                params.apiKeyIds && params.apiKeyIds.length > 0
                    ? params.apiKeyIds.join(",")
                    : undefined,
            models:
                params.models && params.models.length > 0
                    ? params.models.join(",")
                    : undefined,
            limit: params.limit.toString(),
            since: params.since,
            until: params.until,
            before: params.before,
            before_event_id: params.beforeEventId,
        },
    );
}

function stripUsageCursor(row: UsageRecordWithCursor): UsageRecord {
    const { cursor_event_id: _, ...usage } = row;
    return usage;
}

// Shared tail for the detailed-usage endpoints (/usage, /key/usage):
// fetch a page from the user_usage pipe, return the cursor for JSON pagination,
// but keep CSV output on its established public columns.
async function respondDetailedUsage(
    c: Pick<Context<Env>, "env" | "json">,
    log: Logger,
    params: {
        userId: string;
        apiKeyId?: string;
        apiKeyIds?: string[];
        models?: string[];
        filenamePrefix: string;
        filenamePeriod: string;
        format: "json" | "csv";
        limit: number;
        since: string;
        until: string;
        before?: string;
        beforeEventId?: string;
    },
): Promise<Response> {
    const tinybirdOrigin = new URL(c.env.TINYBIRD_INGEST_URL).origin;
    const tinybirdToken = requireTinybirdReadToken(c.env);

    try {
        const usage = await fetchDetailedUsagePage(
            tinybirdOrigin,
            tinybirdToken,
            {
                userId: params.userId,
                apiKeyId: params.apiKeyId,
                apiKeyIds: params.apiKeyIds,
                models: params.models,
                limit: params.limit,
                since: params.since,
                until: params.until,
                before: params.before,
                beforeEventId: params.beforeEventId,
            },
        );

        if (params.format === "csv") {
            const rows = usage.map(stripUsageCursor).map(usageRecordToCsvRow);
            const csv = [USAGE_CSV_HEADER, ...rows].join("\n");
            return new Response(csv, {
                headers: {
                    "Content-Type": "text/csv",
                    "Content-Disposition": `attachment; filename="${params.filenamePrefix}-${usage.length}-rows-${params.filenamePeriod}-${new Date().toISOString().split("T")[0]}.csv"`,
                },
            });
        }

        return c.json({ usage, count: usage.length });
    } catch (error) {
        log.error("Error fetching usage: {error}", { error });
        return c.json({ error: "Failed to fetch usage data" }, 500);
    }
}

// Response schemas for OpenAPI documentation
const profileResponseSchema = z.object({
    githubUsername: z.string().nullable().describe("GitHub username if linked"),
    image: z
        .string()
        .nullable()
        .describe("Profile picture URL (e.g. GitHub avatar)"),
    tier: z
        .enum(["anonymous", ...tierNames])
        .describe("User's current tier level"),
    nextResetAt: z.iso
        .datetime()
        .nullable()
        .describe(
            "Next pollen refill timestamp (ISO 8601). `null` for tiers with no refill.",
        ),
    communityEndpointsAllowed: z
        .boolean()
        .describe(
            "Whether the account is allowed to manage community endpoints.",
        ),
    name: z
        .string()
        .nullable()
        .optional()
        .describe(
            "User's display name (only returned when the key has `account:profile` or `account:keys`)",
        ),
    email: z
        .email()
        .nullable()
        .optional()
        .describe(
            "User's email address (only returned when the key has `account:profile` or `account:keys`)",
        ),
});

const balanceResponseSchema = z.object({
    balance: z
        .number()
        .describe(
            "Remaining pollen balance (sum of tier balance + paid balance)",
        ),
});

const accountQuestRewardSchema = z.object({
    id: z.string(),
    questId: z.string().nullable(),
    title: z.string(),
    pollenAmount: z.number(),
    balanceBucket: z.string(),
    earnedAt: z.string(),
    claimedAt: z.string().nullable(),
});

const accountQuestSchema = z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    category: z.enum(QUEST_CATEGORIES),
    state: z.enum(["available", "completed", "coming_soon"]),
    status: z.enum(["open", "completed", "coming_soon"]),
    rewardAmount: z.number(),
    balanceBucket: z.enum(["tier", "pack"]),
    url: z.string().nullable(),
    reward: accountQuestRewardSchema.nullable(),
});

const accountQuestsResponseSchema = z.object({
    quests: z.array(accountQuestSchema),
});

function formatRewardTimestamp(value: Date | number | string): string {
    return value instanceof Date
        ? value.toISOString()
        : new Date(value).toISOString();
}

const usageRecordSchema = z.object({
    timestamp: z
        .string()
        .describe("Request timestamp (YYYY-MM-DD HH:mm:ss format)"),
    cursor_event_id: z
        .string()
        .describe("Event id used with `before_event_id` for stable pagination"),
    type: z
        .string()
        .describe("Request type (e.g., 'generate.image', 'generate.text')"),
    model: z.string().nullable().describe("Model used for generation"),
    api_key_id: z
        .string()
        .nullable()
        .describe("API key id used for generation"),
    api_key: z.string().nullable().describe("API key display name"),
    api_key_type: z
        .string()
        .nullable()
        .describe("Type of API key ('secret', 'publishable')"),
    meter_source: z
        .string()
        .nullable()
        .describe(
            "Billing source: 'tier' = tier balance, 'pack' = paid balance",
        ),
    input_text_tokens: z.number().describe("Number of input text tokens"),
    input_cached_tokens: z.number().describe("Number of cached input tokens"),
    input_audio_tokens: z.number().describe("Number of input audio tokens"),
    input_audio_seconds: z
        .number()
        .describe("Duration of input audio in seconds (for transcription/STT)"),
    input_image_tokens: z.number().describe("Number of input image tokens"),
    output_text_tokens: z.number().describe("Number of output text tokens"),
    output_reasoning_tokens: z
        .number()
        .describe(
            "Number of reasoning tokens (for models with chain-of-thought)",
        ),
    output_audio_tokens: z.number().describe("Number of output audio tokens"),
    output_audio_seconds: z
        .number()
        .describe(
            "Duration of output audio in seconds (for TTS/music generation)",
        ),
    output_image_tokens: z
        .number()
        .describe("Number of output image tokens (1 per image)"),
    output_video_seconds: z
        .number()
        .describe("Duration of output video in seconds"),
    cost_usd: z.number().describe("Cost in USD for this request"),
    response_time_ms: z
        .number()
        .nullable()
        .describe("Response time in milliseconds"),
});

const usageResponseSchema = z.object({
    usage: z.array(usageRecordSchema).describe("Array of usage records"),
    count: z.number().describe("Number of records returned"),
});

/**
 * Account routes - profile, balance and usage endpoints.
 * Supports both session cookies and API keys with permission checks.
 */
export const accountRoutes = new Hono<Env>()
    .use(auth({ allowApiKey: true, allowSessionCookie: true }))
    .route("/my-models", communityEndpointsRoutes)
    .get(
        "/profile",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Get Profile",
            description:
                "Returns your account profile. GitHub username, profile image, current tier, next pollen refill timestamp, and community model access are always returned. Name and email are returned only when the API key has `account:profile`.",
            responses: {
                200: {
                    description: "User profile",
                    content: {
                        "application/json": {
                            schema: resolver(profileResponseSchema),
                        },
                    },
                },
                401: { description: "Unauthorized" },
            },
        }),
        async (c) => {
            await c.var.auth.requireAuthorization();
            const user = c.var.auth.requireUser();
            const apiKey = c.var.auth.apiKey;
            const includeProfilePII =
                !apiKey || hasAccountReadPermission(apiKey, "profile");

            const db = drizzle(c.env.DB);
            const users = await db
                .select({
                    githubId: userTable.githubId,
                    githubUsername: userTable.githubUsername,
                    image: userTable.image,
                    tier: userTable.tier,
                    name: userTable.name,
                    email: userTable.email,
                })
                .from(userTable)
                .where(eq(userTable.id, user.id))
                .limit(1);

            const profile = users[0];
            if (!profile) {
                throw new HTTPException(404, { message: "User not found" });
            }

            return c.json({
                githubUsername: profile.githubUsername ?? null,
                image: profile.image ?? null,
                tier: profile.tier,
                nextResetAt: getNextRefillAt(profile.tier),
                communityEndpointsAllowed:
                    isCommunityEndpointOwnerAllowed(profile),
                ...(includeProfilePII && {
                    name: profile.name ?? null,
                    email: profile.email ?? null,
                }),
            });
        },
    )
    .get(
        "/quests",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Get Quest Status",
            description:
                "Returns the quest catalog with the authenticated account's read-only status. Globally completed quests and quests earned by the account are both returned as `completed`. API keys require the read-only `account:usage` permission. Claiming rewards remains dashboard-only.",
            responses: {
                200: {
                    description: "Quest status for the authenticated account",
                    content: {
                        "application/json": {
                            schema: resolver(accountQuestsResponseSchema),
                        },
                    },
                },
                401: { description: "Unauthorized" },
                403: {
                    description:
                        "Permission denied - API key missing `account:usage` permission",
                },
            },
        }),
        async (c) => {
            await c.var.auth.requireAuthorization();
            const user = c.var.auth.requireUser();
            requireUsagePermission(c.var.auth.apiKey);

            const db = drizzle(c.env.DB, { schema });
            const [cards, rewardRows] = await Promise.all([
                listQuestCards({ db, env: c.env }),
                db
                    .select({
                        id: rewardsTable.id,
                        questId: rewardsTable.questId,
                        title: rewardsTable.title,
                        pollenAmount: rewardsTable.pollenAmount,
                        balanceBucket: rewardsTable.balanceBucket,
                        earnedAt: rewardsTable.earnedAt,
                        claimedAt: rewardsTable.claimedAt,
                    })
                    .from(rewardsTable)
                    .where(eq(rewardsTable.userId, user.id))
                    .orderBy(desc(rewardsTable.earnedAt)),
            ]);

            const rewardsByQuestId = new Map<
                string,
                (typeof rewardRows)[number]
            >();
            for (const reward of rewardRows) {
                if (reward.questId && !rewardsByQuestId.has(reward.questId)) {
                    rewardsByQuestId.set(reward.questId, reward);
                }
            }

            const quests = cards.map((card) => {
                const reward = rewardsByQuestId.get(card.id) ?? null;
                const status =
                    card.state === "coming_soon"
                        ? "coming_soon"
                        : card.state === "completed" || reward
                          ? "completed"
                          : "open";

                return {
                    ...card,
                    status,
                    reward: reward
                        ? {
                              id: reward.id,
                              questId: reward.questId,
                              title: reward.title,
                              pollenAmount: reward.pollenAmount,
                              balanceBucket: reward.balanceBucket,
                              earnedAt: formatRewardTimestamp(reward.earnedAt),
                              claimedAt: reward.claimedAt
                                  ? formatRewardTimestamp(reward.claimedAt)
                                  : null,
                          }
                        : null,
                };
            });

            return c.json({ quests });
        },
    )
    .get(
        "/balance",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Get Balance",
            description:
                "Returns the pollen balance visible to the caller. API keys with a budget always see their remaining budget (no scope needed). Full account balance requires the read-only `account:usage` permission.",
            responses: {
                200: {
                    description: "Pollen balance",
                    content: {
                        "application/json": {
                            schema: resolver(balanceResponseSchema),
                        },
                    },
                },
                401: { description: "Unauthorized" },
                403: {
                    description:
                        "Permission denied - API key has no budget and is missing `account:usage` permission",
                },
            },
        }),
        async (c) => {
            await c.var.auth.requireAuthorization();
            const user = c.var.auth.requireUser();
            const apiKey = c.var.auth.apiKey;

            // Keys with a budget always see their own budget — no scope needed.
            if (apiKey?.pollenBalance != null) {
                return c.json({ balance: apiKey.pollenBalance });
            }

            // Beyond that, reading account balance requires usage or admin.
            if (apiKey && !hasAccountReadPermission(apiKey, "usage")) {
                throw new HTTPException(403, {
                    message:
                        "API key does not have 'account:usage' permission and no budget of its own. Add `account:usage` or set a budget on the key.",
                });
            }

            const db = drizzle(c.env.DB);
            const users = await db
                .select({
                    tierBalance: userTable.tierBalance,
                    packBalance: userTable.packBalance,
                })
                .from(userTable)
                .where(eq(userTable.id, user.id))
                .limit(1);

            const tierBalance = users[0]?.tierBalance ?? 0;
            const packBalance = users[0]?.packBalance ?? 0;

            return c.json({ balance: tierBalance + packBalance });
        },
    )
    .get(
        "/usage",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Get Usage History",
            description:
                "Returns your request history with per-request details: model used, token counts, cost, and response time. Defaults to the last 30 days, supports up to 90 days via `days`, or exact day/week/month periods via `granularity` and `period`. Supports JSON and CSV export. Each response is capped at 50,000 rows. Use `before` with `before_event_id` for stable cursor-based pagination. API keys require the read-only `account:usage` permission.",
            responses: {
                200: {
                    description: "Usage records",
                    content: {
                        "application/json": {
                            schema: resolver(usageResponseSchema),
                        },
                    },
                },
                401: { description: "Unauthorized" },
                403: {
                    description:
                        "Permission denied - API key missing `account:usage` permission",
                },
            },
        }),
        validator("query", usageQuerySchema),
        async (c) => {
            const log = c.get("log").getChild("usage");

            await c.var.auth.requireAuthorization({
                message: "Authentication required to view usage history",
            });

            const user = c.var.auth.requireUser();
            const apiKey = c.var.auth.apiKey;

            requireUsagePermission(apiKey);

            const {
                format,
                limit,
                before,
                before_event_id: beforeEventId,
                days,
                granularity,
                period,
                api_key_ids: apiKeyIds,
                models,
            } = c.req.valid("query");
            const { userId: usageUserId, overridden: usageUserOverridden } =
                resolveUsageTargetUserId(c.env, user.id, apiKey);
            const usageWindow = formatUsageWindow(
                resolveUsageWindow(days, {
                    granularity,
                    period,
                }),
            );
            const filenamePeriod = usageWindowFilenamePart(days, {
                granularity,
                period,
            });

            log.debug(
                "Fetching usage: requesterUserId={requesterUserId} targetUserId={targetUserId} override={override} format={format} limit={limit} before={before} beforeEventId={beforeEventId} days={days}",
                {
                    requesterUserId: user.id,
                    targetUserId: usageUserId,
                    override: usageUserOverridden,
                    format,
                    limit,
                    before,
                    beforeEventId,
                    days,
                },
            );

            return respondDetailedUsage(c, log, {
                userId: usageUserId,
                filenamePrefix: "pollinations-usage-latest",
                filenamePeriod,
                format,
                limit,
                apiKeyIds,
                models,
                since: usageWindow.since,
                until: usageWindow.until,
                before,
                beforeEventId,
            });
        },
    )
    .get(
        "/usage/daily",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Get Daily Usage",
            description:
                "Returns daily aggregated usage for the requested time window, grouped by date and model. Use `days` for rolling windows or `granularity` and `period` for exact day/week/month periods. Useful for dashboards and spending analysis. Supports JSON and CSV export. Results are cached for 1 hour. API keys require the read-only `account:usage` permission.",
            responses: {
                200: {
                    description: "Daily usage records aggregated by date/model",
                    content: {
                        "application/json": {
                            schema: resolver(dailyUsageResponseSchema),
                        },
                    },
                },
                401: { description: "Unauthorized" },
                403: {
                    description:
                        "Permission denied - API key missing `account:usage` permission",
                },
            },
        }),
        validator("query", usageDailyQuerySchema),
        async (c) => {
            const log = c.get("log").getChild("usage-daily");

            await c.var.auth.requireAuthorization({
                message: "Authentication required to view usage history",
            });

            const user = c.var.auth.requireUser();
            const apiKey = c.var.auth.apiKey;

            requireUsagePermission(apiKey);

            const {
                format,
                days,
                granularity,
                period,
                api_key_ids: apiKeyIds,
            } = c.req.valid("query");
            const grain = granularity === "day" ? "hour" : "day";
            const { userId: usageUserId, overridden: usageUserOverridden } =
                resolveUsageTargetUserId(c.env, user.id, apiKey);
            const tinybirdOrigin = new URL(c.env.TINYBIRD_INGEST_URL).origin;
            const tinybirdToken = requireTinybirdReadToken(c.env);
            const kv = c.env.KV;
            const cacheKeyPrefix = usageUserOverridden
                ? `usage:daily:debug:${usageUserId}`
                : `usage:daily:${usageUserId}`;
            const periodCacheKey =
                granularity && period ? `${granularity}:${period}` : `${days}d`;
            const filenamePeriod = usageWindowFilenamePart(days, {
                granularity,
                period,
            });
            const cacheKey = `${cacheKeyPrefix}:${periodCacheKey}:grain:${grain}:${apiKeyIds.length > 0 ? `keys:${apiKeyIds.join(",")}` : "all"}`;
            const windows = buildUsageWindows(days, { granularity, period });

            try {
                let usage: DailyUsageRecord[] | null = null;
                let cached = false;

                try {
                    const cachedData = await kv.get<DailyUsageRecord[]>(
                        cacheKey,
                        "json",
                    );
                    if (cachedData) {
                        usage = cachedData;
                        cached = true;
                    }
                } catch (err) {
                    log.trace("KV get error: {err}", { err });
                }

                if (!usage) {
                    const chunkResults = await Promise.all(
                        windows.map((window) =>
                            fetchTinybirdRows<DailyUsageRecord>(
                                tinybirdOrigin,
                                "/v0/pipes/user_usage_daily_filtered.json",
                                tinybirdToken,
                                {
                                    user_id: usageUserId,
                                    since: window.since,
                                    until: window.until,
                                    grain,
                                    api_key_ids:
                                        apiKeyIds.length > 0
                                            ? apiKeyIds.join(",")
                                            : undefined,
                                },
                            ),
                        ),
                    );
                    usage = sortDailyUsageRecords(chunkResults.flat());

                    try {
                        await kv.put(cacheKey, JSON.stringify(usage), {
                            expirationTtl: CACHE_TTL,
                        });
                    } catch (err) {
                        log.trace("KV put error: {err}", { err });
                    }
                }

                log.debug(
                    "Fetched daily usage: requesterUserId={requesterUserId} targetUserId={targetUserId} override={override} days={days} apiKeyIds={apiKeyIds} count={count} cached={cached}",
                    {
                        requesterUserId: user.id,
                        targetUserId: usageUserId,
                        override: usageUserOverridden,
                        days,
                        apiKeyIds,
                        count: usage.length,
                        cached,
                    },
                );

                if (format === "csv") {
                    const header = "date,model,meter_source,requests,cost_usd";
                    const rows = usage.map(dailyUsageRecordToCsvRow);
                    const csv = [header, ...rows].join("\n");

                    return new Response(csv, {
                        headers: {
                            "Content-Type": "text/csv",
                            "Content-Disposition": `attachment; filename="pollinations-usage-daily-${filenamePeriod}-${new Date().toISOString().split("T")[0]}.csv"`,
                        },
                    });
                }

                return c.json({
                    usage,
                    count: usage.length,
                });
            } catch (error) {
                log.error("Error fetching daily usage: {error}", { error });
                return c.json({ error: "Failed to fetch usage data" }, 500);
            }
        },
    )
    .get(
        "/earnings",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Get Developer Earnings",
            description:
                "Returns developer earnings in one response: per-(date, entity) buckets, per-entity rollups, per-source rollups, and additive money totals across BYOP apps and community models. Source-specific rows include `requests`, `baseline_price`, reward basis `cost_usd`, `reward_rate`, and `unique_users`; the top-level total only includes additive earned-pollen fields. Use `days` for rolling windows or `granularity` and `period` for exact day/week/month periods. Cached for 1 hour. API keys require the read-only `account:usage` permission.",
            responses: {
                200: {
                    description:
                        "Source-specific earnings buckets and additive totals",
                    content: {
                        "application/json": {
                            schema: resolver(developerEarningsResponseSchema),
                        },
                    },
                },
                401: { description: "Unauthorized" },
                403: {
                    description:
                        "Permission denied - API key missing `account:usage` permission",
                },
            },
        }),
        validator("query", earningsQuerySchema),
        async (c) => {
            const log = c.get("log").getChild("earnings");

            await c.var.auth.requireAuthorization({
                message: "Authentication required to view earnings",
            });

            const user = c.var.auth.requireUser();
            const apiKey = c.var.auth.apiKey;

            requireUsagePermission(apiKey);

            const {
                format,
                days,
                granularity,
                period,
                api_key_ids: apiKeyIds,
                entity_ids: entityIds,
            } = c.req.valid("query");
            const grain = granularity === "day" ? "hour" : "day";
            const selectedEntityIds =
                entityIds.length > 0 ? entityIds : apiKeyIds;
            const { userId: devUserId, overridden: devUserOverridden } =
                resolveUsageTargetUserId(c.env, user.id, apiKey);
            const tinybirdOrigin = new URL(c.env.TINYBIRD_INGEST_URL).origin;
            const tinybirdToken = requireTinybirdReadToken(c.env);
            const kv = c.env.KV;
            // v5: no blended global row; total contains additive money fields only.
            const cacheKeyPrefix = devUserOverridden
                ? `earnings:v5:debug:${devUserId}`
                : `earnings:v5:${devUserId}`;
            const periodCacheKey =
                granularity && period ? `${granularity}:${period}` : `${days}d`;
            const cacheKey = `${cacheKeyPrefix}:${periodCacheKey}:grain:${grain}:${selectedEntityIds.length > 0 ? `entities:${selectedEntityIds.join(",")}` : "all"}`;
            const filenamePeriod = usageWindowFilenamePart(days, {
                granularity,
                period,
            });
            const window = formatUsageWindow(
                resolveUsageWindow(days, { granularity, period }),
            );

            type EarningsPayload = {
                daily: DeveloperEarningsRow[];
                perEntity: DeveloperEarningsRow[];
                bySource: DeveloperEarningsRow[];
                total: DeveloperEarningsTotal;
            };

            try {
                let payload: EarningsPayload | null = null;
                let cached = false;

                try {
                    const cachedData = await kv.get<EarningsPayload>(
                        cacheKey,
                        "json",
                    );
                    if (cachedData) {
                        payload = cachedData;
                        cached = true;
                    }
                } catch (err) {
                    log.trace("KV get error: {err}", { err });
                }

                if (!payload) {
                    const rows = await fetchTinybirdRows<DeveloperEarningsRow>(
                        tinybirdOrigin,
                        "/v0/pipes/developer_earnings.json",
                        tinybirdToken,
                        {
                            dev_user_id: devUserId,
                            since: window.since,
                            until: window.until,
                            grain,
                            entity_ids:
                                selectedEntityIds.length > 0
                                    ? selectedEntityIds.join(",")
                                    : undefined,
                        },
                    );
                    const daily = rows.filter((r) => r.date !== "");
                    const rollups = rows.filter((r) => r.date === "");
                    const perEntity = [...rollups]
                        .filter((r) => r.entity_id !== "")
                        .sort((a, b) => b.pollen_earned - a.pollen_earned);
                    const bySource = [...rollups]
                        .filter((r) => r.entity_id === "")
                        .sort((a, b) => b.pollen_earned - a.pollen_earned);
                    payload = {
                        daily,
                        perEntity,
                        bySource,
                        total: totalDeveloperEarnings(bySource),
                    };

                    try {
                        await kv.put(cacheKey, JSON.stringify(payload), {
                            expirationTtl: CACHE_TTL,
                        });
                    } catch (err) {
                        log.trace("KV put error: {err}", { err });
                    }
                }

                log.debug(
                    "Fetched earnings: requesterUserId={requesterUserId} devUserId={devUserId} override={override} days={days} dailyCount={dailyCount} entityCount={entityCount} cached={cached}",
                    {
                        requesterUserId: user.id,
                        devUserId,
                        override: devUserOverridden,
                        days,
                        dailyCount: payload.daily.length,
                        entityCount: payload.perEntity.length,
                        cached,
                    },
                );

                if (format === "csv") {
                    const header =
                        "date,source,entity_id,entity_name,requests,baseline_price,pollen_earned,paid_earned,tier_earned,cost_usd,reward_rate";
                    const rows = payload.daily.map(dailyEarningsRowToCsvRow);
                    const csv = [header, ...rows].join("\n");

                    return new Response(csv, {
                        headers: {
                            "Content-Type": "text/csv",
                            "Content-Disposition": `attachment; filename="pollinations-earnings-${filenamePeriod}-${new Date().toISOString().split("T")[0]}.csv"`,
                        },
                    });
                }

                return c.json(payload);
            } catch (error) {
                log.error("Error fetching earnings: {error}", { error });
                return c.json({ error: "Failed to fetch earnings data" }, 500);
            }
        },
    )
    .get(
        "/keys",
        describeRoute({
            tags: ["👤 Account"],
            summary: "List API Keys",
            description:
                "List all API keys for the current user. Requires `account:keys` permission when using API keys. Secret key values are never returned.",
            responses: {
                200: { description: "List of API keys" },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
            },
        }),
        async (c) => {
            await c.var.auth.requireAuthorization();
            const user = c.var.auth.requireUser();
            requireKeysPermission(c.var.auth.apiKey);

            const db = drizzle(c.env.DB);
            const keys = await db
                .select({
                    id: apikeyTable.id,
                    name: apikeyTable.name,
                    start: apikeyTable.start,
                    prefix: apikeyTable.prefix,
                    createdAt: apikeyTable.createdAt,
                    expiresAt: apikeyTable.expiresAt,
                    lastRequest: apikeyTable.lastRequest,
                    permissions: apikeyTable.permissions,
                    metadata: apikeyTable.metadata,
                    pollenBalance: apikeyTable.pollenBalance,
                    enabled: apikeyTable.enabled,
                })
                .from(apikeyTable)
                .where(eq(apikeyTable.userId, user.id))
                .all();

            c.header("Cache-Control", "private, no-store, max-age=0");
            return c.json({
                data: keys.map((key) => ({
                    id: key.id,
                    name: key.name,
                    start: key.start,
                    prefix: key.prefix,
                    createdAt: key.createdAt,
                    expiresAt: key.expiresAt,
                    lastRequest: key.lastRequest,
                    permissions: key.permissions
                        ? (() => {
                              try {
                                  return JSON.parse(key.permissions);
                              } catch {
                                  return null;
                              }
                          })()
                        : null,
                    metadata: parseMetadata(key.metadata),
                    pollenBalance: key.pollenBalance,
                    enabled: key.enabled,
                })),
            });
        },
    )
    .post(
        "/keys",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Create API Key",
            description:
                'Create a new API key. To create an app key, use `type: "publishable"` with `redirectUris`. Publishable app keys default developer earnings off; send `earningsEnabled: true` to opt in. Requires `account:keys` permission when using API keys. The full key value is returned only once in the response. The `keys` account permission is automatically stripped from child keys to prevent escalation.',
            responses: {
                200: { description: "Created API key with full secret" },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
            },
        }),
        validator("json", CreateKeySchema),
        async (c) => {
            await c.var.auth.requireAuthorization();
            const user = c.var.auth.requireUser();
            requireKeysPermission(c.var.auth.apiKey);

            const {
                name,
                type,
                expiresIn,
                allowedModels,
                pollenBudget,
                accountPermissions,
                redirectUris,
                earningsEnabled,
            } = c.req.valid("json");

            const metadata =
                type === "publishable"
                    ? {
                          ...(redirectUris?.length ? { redirectUris } : {}),
                          ...(earningsEnabled !== undefined
                              ? { earningsEnabled }
                              : {}),
                      }
                    : undefined;

            const created = await createApiKeyForUser({
                authClient: c.var.auth.client,
                dbBinding: c.env.DB,
                userId: user.id,
                name,
                type,
                expiresIn,
                allowedModels,
                pollenBudget,
                accountPermissions,
                metadata,
                allowAccountKeysPermission: false,
                defaultCreatedVia: "api",
            });
            return c.json(created);
        },
    )
    .delete(
        "/keys/:id",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Revoke API Key",
            description:
                "Delete/revoke an API key. Requires `account:keys` permission when using API keys. Cannot revoke the key used to authenticate the request.",
            responses: {
                200: { description: "Key revoked" },
                400: { description: "Cannot revoke self" },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
                404: { description: "Key not found" },
            },
        }),
        async (c) => {
            await c.var.auth.requireAuthorization();
            const user = c.var.auth.requireUser();
            const callerKey = c.var.auth.apiKey;
            requireKeysPermission(callerKey);

            const { id } = c.req.param();

            // Prevent self-revocation
            if (callerKey && callerKey.id === id) {
                throw new HTTPException(400, {
                    message:
                        "Cannot revoke the API key used to authenticate this request",
                });
            }

            const db = drizzle(c.env.DB);
            const key = await db
                .select()
                .from(apikeyTable)
                .where(
                    and(
                        eq(apikeyTable.id, id),
                        eq(apikeyTable.userId, user.id),
                    ),
                )
                .get();

            if (!key) {
                throw new HTTPException(404, { message: "API key not found" });
            }

            await db.delete(apikeyTable).where(eq(apikeyTable.id, id));

            return c.json({ success: true });
        },
    )
    .get(
        "/key",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Get API Key Info",
            description:
                "Returns information about the API key used in the request: validity, type (secret/publishable), expiry, permissions, and remaining budget. Useful for validating keys without making generation requests.",
            responses: {
                200: {
                    description: "API key status and information",
                    content: {
                        "application/json": {
                            schema: resolver(
                                z.object({
                                    valid: z
                                        .boolean()
                                        .describe(
                                            "Whether the API key is valid and active",
                                        ),
                                    type: z
                                        .enum(["publishable", "secret"])
                                        .describe("Type of API key"),
                                    name: z
                                        .string()
                                        .nullable()
                                        .describe(
                                            "Display name of the API key",
                                        ),
                                    expiresAt: z
                                        .string()
                                        .nullable()
                                        .describe(
                                            "Expiry timestamp in ISO 8601 format, null if never expires",
                                        ),
                                    expiresIn: z
                                        .number()
                                        .nullable()
                                        .describe(
                                            "Seconds until expiry, null if never expires",
                                        ),
                                    permissions: z
                                        .object({
                                            models: z
                                                .array(z.string())
                                                .nullable()
                                                .describe(
                                                    "List of allowed model IDs, null = all models allowed",
                                                ),
                                            account: z
                                                .array(z.string())
                                                .nullable()
                                                .describe(
                                                    "List of account permissions, null = no account access",
                                                ),
                                        })
                                        .describe("API key permissions"),
                                    pollenBudget: z
                                        .number()
                                        .nullable()
                                        .describe(
                                            "Remaining pollen budget for this key, null = unlimited (uses user balance)",
                                        ),
                                    rateLimitEnabled: z
                                        .boolean()
                                        .describe(
                                            "Whether rate limiting is enabled for this key",
                                        ),
                                    userId: z
                                        .string()
                                        .nullable()
                                        .describe(
                                            "Stable id of the user that owns this key — server-attested.",
                                        ),
                                    keyId: z
                                        .string()
                                        .describe(
                                            "Stable id of this API key — server-attested.",
                                        ),
                                    byopClientKeyId: z
                                        .string()
                                        .nullable()
                                        .describe(
                                            "Publishable app key that minted this key via the BYOP authorize flow. Server-attested; clients cannot forge.",
                                        ),
                                }),
                            ),
                        },
                    },
                },
                401: {
                    description: "Invalid or missing API key",
                },
            },
        }),
        async (c) => {
            const log = c.get("log").getChild("account-key");

            // This endpoint requires API key authentication
            const apiKey = c.var.auth.apiKey;
            if (!apiKey) {
                log.debug("No API key provided");
                throw new HTTPException(401, {
                    message:
                        "API key required. This endpoint validates API keys.",
                });
            }

            log.debug("Returning status for API key: {keyId}", {
                keyId: apiKey.id,
            });

            // Get key type from metadata (set at key creation time)
            const keyType: ApiKeyType =
                (apiKey.metadata?.keyType as ApiKeyType) || "secret";

            // Fetch additional key details from DB
            const db = drizzle(c.env.DB);
            const keyDetails = await db
                .select({
                    expiresAt: apikeyTable.expiresAt,
                })
                .from(apikeyTable)
                .where(eq(apikeyTable.id, apiKey.id))
                .get();

            let expiresAt: string | null = null;
            let expiresIn: number | null = null;

            if (keyDetails?.expiresAt) {
                // Convert timestamp to ISO string
                const expiryDate = new Date(keyDetails.expiresAt);
                expiresAt = expiryDate.toISOString();

                // Calculate seconds until expiry
                const now = Date.now();
                const msUntilExpiry = expiryDate.getTime() - now;

                if (msUntilExpiry > 0) {
                    expiresIn = Math.floor(msUntilExpiry / 1000);
                } else {
                    // Key is already expired
                    expiresIn = 0;
                }
            }

            // Format permissions for response
            const permissions = {
                models: apiKey.permissions?.models || null,
                account: apiKey.permissions?.account || null,
            };

            return c.json({
                valid: true, // If we got here, the key is valid
                type: keyType,
                name: apiKey.name || null,
                expiresAt,
                expiresIn,
                permissions,
                pollenBudget: apiKey.pollenBalance ?? null,
                // Generation rate limiting applies to publishable keys only.
                rateLimitEnabled: keyType === "publishable",
                // Server-attested identity. Downstream services (media catalog)
                // stamp ownership from these values — never from request
                // params — so user and BYOP app ids cannot be spoofed.
                userId: c.var.auth.user?.id ?? null,
                keyId: apiKey.id,
                byopClientKeyId: apiKey.byopClientKeyId ?? null,
            });
        },
    )
    .get(
        "/key/usage",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Get API Key Usage",
            description:
                "Returns usage history for the API key used in the request. No scope required — a key can always read its own usage. Use `before` with `before_event_id` for stable cursor-based pagination. For account-wide usage across all keys, use `/account/usage` with `account:usage`.",
            responses: {
                200: {
                    description: "Usage records for this key",
                    content: {
                        "application/json": {
                            schema: resolver(usageResponseSchema),
                        },
                    },
                },
                401: {
                    description:
                        "API key required (this endpoint is key-auth only)",
                },
            },
        }),
        validator("query", usageQuerySchema),
        async (c) => {
            const log = c.get("log").getChild("key-usage");
            const apiKey = c.var.auth.apiKey;
            if (!apiKey) {
                throw new HTTPException(401, {
                    message:
                        "API key required. This endpoint is authenticated by API key only.",
                });
            }
            const user = c.var.auth.requireUser();

            const {
                format,
                limit,
                before,
                before_event_id: beforeEventId,
                days,
                granularity,
                period,
                models,
            } = c.req.valid("query");
            const usageWindow = formatUsageWindow(
                resolveUsageWindow(days, {
                    granularity,
                    period,
                }),
            );
            const filenamePeriod = usageWindowFilenamePart(days, {
                granularity,
                period,
            });

            log.debug(
                "Fetching key usage: userId={userId} keyId={keyId} days={days}",
                { userId: user.id, keyId: apiKey.id, days },
            );

            return respondDetailedUsage(c, log, {
                userId: user.id,
                apiKeyId: apiKey.id,
                filenamePrefix: "pollinations-key-usage",
                filenamePeriod,
                format,
                limit,
                models,
                since: usageWindow.since,
                until: usageWindow.until,
                before,
                beforeEventId,
            });
        },
    );
