// REMOVE BEFORE MERGE — design-only mock for the wallet + earnings dashboard.
// Activated via `?mockEarnings=<scenario>` (gated on `import.meta.env.DEV` so it
// can't reach prod), wired in:
//   - src/client/routes/index.tsx (loader: paidWeek/tierWeek override)
//   - src/client/components/usage-analytics/use-earnings-data.ts (fetch short-circuit)
// Strip those call sites and delete this file once the design loop is finished.
import type {
    DeveloperEarningsRow,
    EarningsFilterState,
} from "../components/usage-analytics/use-earnings-data.ts";

export type MockEarningsScenario =
    | "none"
    | "small"
    | "big"
    | "spiky"
    | "growth";

const SCENARIOS: ReadonlySet<MockEarningsScenario> = new Set([
    "none",
    "small",
    "big",
    "spiky",
    "growth",
]);

export function getMockEarningsScenario(): MockEarningsScenario | null {
    if (!import.meta.env.DEV) return null;
    if (typeof window === "undefined") return null;
    const raw = new URLSearchParams(window.location.search).get("mockEarnings");
    if (!raw) return null;
    return SCENARIOS.has(raw as MockEarningsScenario)
        ? (raw as MockEarningsScenario)
        : null;
}

const SCENARIO_TODAY: Record<
    MockEarningsScenario,
    { paidWeek: number; tierWeek: number }
> = {
    none: { paidWeek: 0, tierWeek: 0 },
    small: { paidWeek: 12.4, tierWeek: 3.1 },
    big: { paidWeek: 1842.7, tierWeek: 461.2 },
    spiky: { paidWeek: 287.5, tierWeek: 19.8 },
    growth: { paidWeek: 96.3, tierWeek: 24.6 },
};

export function getMockTodayEarnings(scenario: MockEarningsScenario): {
    paidWeek: number;
    tierWeek: number;
} {
    return SCENARIO_TODAY[scenario];
}

const MOCK_APPS: Array<{ id: string; name: string }> = [
    { id: "mock_app_1", name: "Aurora Studio" },
    { id: "mock_app_2", name: "PromptPilot" },
    { id: "mock_app_3", name: "Lumen Labs" },
];

function shapeMultiplier(
    scenario: MockEarningsScenario,
    dayIndex: number,
    totalDays: number,
): number {
    switch (scenario) {
        case "none":
            return 0;
        case "small":
            return 0.6 + 0.4 * Math.sin(dayIndex * 0.7);
        case "big":
            return 0.8 + 0.3 * Math.sin(dayIndex * 0.5);
        case "spiky": {
            const peak = Math.floor(totalDays * 0.6);
            return dayIndex === peak
                ? 8
                : dayIndex === peak - 1 || dayIndex === peak + 1
                  ? 3
                  : 0.4;
        }
        case "growth":
            return 0.2 + (dayIndex / Math.max(totalDays - 1, 1)) * 1.6;
    }
}

// Per-app per-bucket base earnings. Tuned so that the rendered hourly chart
// totals approximate SCENARIO_TODAY weekly figures (≈ daily/24, divided across
// 3 apps with weights summing to ~2.1 and avg shape multiplier ~0.8).
const SCENARIO_BASE_POLLEN: Record<MockEarningsScenario, number> = {
    none: 0,
    small: 0.05,
    big: 8,
    spiky: 1.2,
    growth: 0.6,
};

export function getMockEarningsResponse(
    scenario: MockEarningsScenario,
    filters: EarningsFilterState,
): {
    daily: DeveloperEarningsRow[];
    perApp: DeveloperEarningsRow[];
    global: DeveloperEarningsRow | null;
} {
    if (scenario === "none") {
        return { daily: [], perApp: [], global: null };
    }

    const isHourly = filters.period.granularity === "day";
    const buckets = isHourly ? 24 : 30;
    const base = SCENARIO_BASE_POLLEN[scenario];
    const apps = filters.selectedAppKeyIds.length
        ? MOCK_APPS.filter((a) => filters.selectedAppKeyIds.includes(a.id))
              .length > 0
            ? MOCK_APPS.filter((a) => filters.selectedAppKeyIds.includes(a.id))
            : MOCK_APPS
        : MOCK_APPS;

    const daily: DeveloperEarningsRow[] = [];
    const now = new Date();
    for (let i = 0; i < buckets; i++) {
        const date = new Date(now);
        if (isHourly) {
            date.setUTCHours(now.getUTCHours() - (buckets - 1 - i), 0, 0, 0);
        } else {
            date.setUTCDate(now.getUTCDate() - (buckets - 1 - i));
            date.setUTCHours(0, 0, 0, 0);
        }
        const mult = shapeMultiplier(scenario, i, buckets);
        apps.forEach((app, appIdx) => {
            const appWeight = 1 - appIdx * 0.3;
            const pollen = base * mult * appWeight;
            if (pollen <= 0) return;
            // Match the bucket-key format expected by getPeriodBucketKeys:
            //   daily: "2026-05-10"
            //   hourly: "2026-05-10 14:00:00"
            const iso = date.toISOString();
            const dateKey = isHourly
                ? `${iso.slice(0, 13).replace("T", " ")}:00:00`
                : iso.slice(0, 10);
            // Per-scenario paid/tier split — wave the ratio a bit by index so
            // bars show some compositional variation across the period.
            const paidShare = 0.6 + 0.25 * Math.sin(i * 0.4 + appIdx);
            const paid = pollen * paidShare;
            const tier = pollen - paid;
            daily.push({
                date: dateKey,
                app_key_id: app.id,
                app_name: app.name,
                requests: Math.round(pollen * 18),
                pollen_earned: pollen,
                paid_earned: paid,
                tier_earned: tier,
                markup_rate: 0.18,
                unique_users: Math.max(1, Math.round(pollen * 0.4)),
            });
        });
    }

    const perAppMap = new Map<string, DeveloperEarningsRow>();
    for (const row of daily) {
        const existing = perAppMap.get(row.app_key_id);
        if (existing) {
            existing.requests += row.requests;
            existing.pollen_earned += row.pollen_earned;
            existing.paid_earned =
                (existing.paid_earned ?? 0) + (row.paid_earned ?? 0);
            existing.tier_earned =
                (existing.tier_earned ?? 0) + (row.tier_earned ?? 0);
            existing.unique_users = Math.max(
                existing.unique_users,
                row.unique_users,
            );
        } else {
            perAppMap.set(row.app_key_id, { ...row, date: "" });
        }
    }
    const perApp = Array.from(perAppMap.values());

    const totalPollen = perApp.reduce((s, r) => s + r.pollen_earned, 0);
    const totalPaid = perApp.reduce((s, r) => s + (r.paid_earned ?? 0), 0);
    const totalTier = perApp.reduce((s, r) => s + (r.tier_earned ?? 0), 0);
    const totalRequests = perApp.reduce((s, r) => s + r.requests, 0);
    const global: DeveloperEarningsRow | null = totalPollen
        ? {
              date: "",
              app_key_id: "",
              app_name: "",
              requests: totalRequests,
              pollen_earned: totalPollen,
              paid_earned: totalPaid,
              tier_earned: totalTier,
              markup_rate: 0.18,
              unique_users: Math.max(...perApp.map((r) => r.unique_users), 0),
          }
        : null;

    return { daily, perApp, global };
}
