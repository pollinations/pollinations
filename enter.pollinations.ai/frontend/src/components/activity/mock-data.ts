import { getPeriodBucketKeys } from "@pollinations/ui";
import type { ApiKey } from "../keys/types.ts";
import type { DailyUsageRecord, UsagePeriodSelection } from "./types.ts";
import type { DeveloperEarningsRow } from "./use-earnings-data.ts";

const MOCK_ACTIVITY_QUERY_PARAM = "mockActivity";

const nowIso = new Date("2026-06-10T12:00:00.000Z").toISOString();

type MockDashboardData = {
    githubUsername: string;
    apiKeys: ApiKey[];
    tierData: {
        target: "flower";
        active: {
            tier: "flower";
            displayName: string;
            pollen: number;
            cadence: "hourly";
        };
    };
    tierBalance: number;
    packBalance: number;
    paidWeek: number;
    tierWeek: number;
};

const mockApiKeys: ApiKey[] = [
    {
        id: "sk-mock-router",
        name: "Router backend",
        start: "sk_mock_router",
        createdAt: nowIso,
        lastRequest: nowIso,
        expiresAt: null,
        enabled: true,
        permissions: {
            models: ["openai-fast", "openai", "qwen-coder"],
            account: ["usage"],
        },
        metadata: {
            keyType: "secret",
            description: "Backend service key",
        },
        pollenBalance: null,
    },
    {
        id: "sk-mock-batch",
        name: "Batch jobs",
        start: "sk_mock_batch",
        createdAt: nowIso,
        lastRequest: nowIso,
        expiresAt: null,
        enabled: true,
        permissions: {
            models: ["openai", "kontext", "elevenlabs"],
            account: ["usage"],
        },
        metadata: {
            keyType: "secret",
            description: "Nightly processing key",
        },
        pollenBalance: null,
    },
    {
        id: "pk-mock-atelier",
        name: "Prompt Atelier",
        start: "pk_mock_atelier",
        createdAt: nowIso,
        lastRequest: nowIso,
        expiresAt: null,
        enabled: true,
        permissions: {
            models: ["openai-fast", "kontext"],
            account: ["profile", "usage"],
        },
        metadata: {
            keyType: "publishable",
            earningsEnabled: true,
            redirectUris: ["http://127.0.0.1/callback"],
        },
        pollenBalance: null,
    },
    {
        id: "pk-mock-garden",
        name: "Garden Studio",
        start: "pk_mock_garden",
        createdAt: nowIso,
        lastRequest: nowIso,
        expiresAt: null,
        enabled: true,
        permissions: {
            models: ["openai", "nanobanana", "elevenlabs"],
            account: ["profile", "usage"],
        },
        metadata: {
            keyType: "publishable",
            earningsEnabled: true,
            redirectUris: ["http://localhost:4179/callback"],
        },
        pollenBalance: null,
    },
    {
        id: "pk-mock-realtime",
        name: "Realtime Booth",
        start: "pk_mock_realtime",
        createdAt: nowIso,
        lastRequest: nowIso,
        expiresAt: null,
        enabled: true,
        permissions: {
            models: ["openai-fast", "elevenlabs"],
            account: ["profile", "usage"],
        },
        metadata: {
            keyType: "publishable",
            earningsEnabled: true,
            redirectUris: ["https://example.local/callback"],
        },
        pollenBalance: null,
    },
];

export function isActivityMockEnabled(): boolean {
    if (!import.meta.env.DEV || typeof window === "undefined") return false;
    return (
        new URLSearchParams(window.location.search).get(
            MOCK_ACTIVITY_QUERY_PARAM,
        ) === "1"
    );
}

export function getActivityMockDashboardData(): MockDashboardData {
    return {
        githubUsername: "DesignQA",
        apiKeys: mockApiKeys,
        tierData: {
            target: "flower",
            active: {
                tier: "flower",
                displayName: "Flower",
                pollen: 100,
                cadence: "hourly",
            },
        },
        tierBalance: 74.28,
        packBalance: 186.4,
        paidWeek: 23.72,
        tierWeek: 8.39,
    };
}

const usageTemplates = [
    {
        apiKeyId: "sk-mock-router",
        model: "openai-fast",
        meterSource: "tier",
        requests: 82,
        pollen: 1.8,
    },
    {
        apiKeyId: "sk-mock-router",
        model: "qwen-coder",
        meterSource: "paid",
        requests: 31,
        pollen: 3.2,
    },
    {
        apiKeyId: "sk-mock-batch",
        model: "kontext",
        meterSource: "paid",
        requests: 18,
        pollen: 7.4,
    },
    {
        apiKeyId: "pk-mock-atelier",
        model: "openai-fast",
        meterSource: "tier",
        requests: 54,
        pollen: 1.1,
    },
    {
        apiKeyId: "pk-mock-garden",
        model: "nanobanana",
        meterSource: "paid",
        requests: 22,
        pollen: 5.9,
    },
    {
        apiKeyId: "pk-mock-realtime",
        model: "elevenlabs",
        meterSource: "tier",
        requests: 12,
        pollen: 2.2,
    },
] as const;

export function getMockUsageRecords(
    period: UsagePeriodSelection,
    selectedKeyIds: string[],
): DailyUsageRecord[] {
    const selectedKeys = new Set(selectedKeyIds);
    const templates =
        selectedKeyIds.length > 0
            ? usageTemplates.filter((template) =>
                  selectedKeys.has(template.apiKeyId),
              )
            : usageTemplates;

    return getPeriodBucketKeys(period).flatMap((date, bucketIndex) => {
        const wave = 0.72 + ((bucketIndex * 7) % 9) / 10;
        return templates.map((template, templateIndex) => {
            const multiplier = wave + templateIndex * 0.08;
            return {
                date,
                api_key_id: template.apiKeyId,
                model: template.model,
                meter_source: template.meterSource,
                requests: Math.max(
                    1,
                    Math.round(template.requests * multiplier),
                ),
                cost_usd: Number((template.pollen * multiplier).toFixed(3)),
            };
        });
    });
}

const earningsApps = [
    {
        id: "pk-mock-atelier",
        name: "Prompt Atelier",
        requests: 46,
        paid: 2.8,
        tier: 0.9,
        uniqueUsers: 8,
    },
    {
        id: "pk-mock-garden",
        name: "Garden Studio",
        requests: 32,
        paid: 3.9,
        tier: 1.4,
        uniqueUsers: 6,
    },
    {
        id: "pk-mock-realtime",
        name: "Realtime Booth",
        requests: 24,
        paid: 1.7,
        tier: 0.8,
        uniqueUsers: 4,
    },
] as const;

function summarizeEarningsRows(
    rows: DeveloperEarningsRow[],
    appKeyId: string,
    appName: string,
): DeveloperEarningsRow {
    const requests = rows.reduce((sum, row) => sum + row.requests, 0);
    const paid = rows.reduce((sum, row) => sum + (row.paid_earned ?? 0), 0);
    const tier = rows.reduce((sum, row) => sum + (row.tier_earned ?? 0), 0);
    const uniqueUsers = rows.reduce((sum, row) => sum + row.unique_users, 0);

    return {
        date: "summary",
        app_key_id: appKeyId,
        app_name: appName,
        requests,
        pollen_earned: Number((paid + tier).toFixed(3)),
        paid_earned: Number(paid.toFixed(3)),
        tier_earned: Number(tier.toFixed(3)),
        markup_rate: 0.18,
        unique_users: uniqueUsers,
    };
}

export function getMockEarningsData(
    period: UsagePeriodSelection,
    selectedAppKeyIds: string[],
): {
    daily: DeveloperEarningsRow[];
    perApp: DeveloperEarningsRow[];
    global: DeveloperEarningsRow | null;
} {
    const selectedApps = new Set(selectedAppKeyIds);
    const apps =
        selectedAppKeyIds.length > 0
            ? earningsApps.filter((app) => selectedApps.has(app.id))
            : earningsApps;

    const daily = getPeriodBucketKeys(period).flatMap((date, bucketIndex) => {
        const wave = 0.78 + ((bucketIndex * 5) % 8) / 10;
        return apps.map((app, appIndex) => {
            const multiplier = wave + appIndex * 0.1;
            const paid = Number((app.paid * multiplier).toFixed(3));
            const tier = Number((app.tier * multiplier).toFixed(3));
            return {
                date,
                app_key_id: app.id,
                app_name: app.name,
                requests: Math.max(1, Math.round(app.requests * multiplier)),
                pollen_earned: Number((paid + tier).toFixed(3)),
                paid_earned: paid,
                tier_earned: tier,
                markup_rate: 0.18,
                unique_users: Math.max(
                    1,
                    Math.round(app.uniqueUsers * multiplier),
                ),
            };
        });
    });

    const perApp = apps.map((app) =>
        summarizeEarningsRows(
            daily.filter((row) => row.app_key_id === app.id),
            app.id,
            app.name,
        ),
    );

    return {
        daily,
        perApp,
        global:
            daily.length > 0
                ? summarizeEarningsRows(daily, "all", "All mock apps")
                : null,
    };
}
