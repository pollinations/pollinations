import { useEffect, useState } from "react";
import * as api from "../lib/api";
import { currentWeekStart } from "../lib/format";

const WEEKS = 12;
const RETENTION_WEEKS = 8;

/**
 * Tinybird calls run one at a time on purpose: the weekly pipes are heavy and
 * firing them together trips the workspace rate limit (429).
 */
const SOURCES = [
    { label: "GitHub stars", key: "github", load: api.github },
    { label: "Registrations", key: "registrations", load: api.registrations },
    { label: "Revenue", key: "revenue", load: () => api.revenue(WEEKS) },
    {
        label: "Health stats",
        key: "health",
        load: () => api.weekly("health", WEEKS),
    },
    { label: "WAU", key: "wau", load: () => api.weekly("wau", WEEKS) },
    {
        label: "Usage stats",
        key: "usage",
        load: () => api.weekly("usage", WEEKS),
    },
    {
        label: "Retention",
        key: "retention",
        load: () => api.weekly("retention", RETENTION_WEEKS),
    },
    {
        label: "User segments",
        key: "segments",
        load: () => api.weekly("user-segments", WEEKS),
    },
    { label: "Activations", key: "activations", load: api.activations },
    {
        label: "App submissions",
        key: "appSubmissions",
        load: api.appSubmissions,
    },
];

export const SOURCE_LABELS = SOURCES.map((source) => source.label);

const REQUIRED = {
    registrations: "D1 (registrations)",
    wau: "Tinybird (WAU)",
    usage: "Tinybird (usage)",
    revenue: "Revenue (Stripe)",
};

function mergeInto(weekMap, rows, project) {
    for (const row of rows ?? []) {
        // weekly_user_segment returns a datetime; every other pipe a date.
        const week = (row.week ?? row.week_start)?.split(" ")[0];
        if (!week) continue;
        weekMap.set(week, {
            ...(weekMap.get(week) || { week }),
            ...project(row),
        });
    }
}

export function useKpiData() {
    const [state, setState] = useState({
        loading: true,
        done: [],
        active: SOURCES[0].label,
        missing: [],
        weeklyData: [],
        allWeeks: [],
        retentionData: [],
        github: { stars: 0, forks: 0 },
    });

    useEffect(() => {
        let cancelled = false;

        async function load() {
            const raw = {};
            for (const source of SOURCES) {
                if (cancelled) return;
                setState((prev) => ({ ...prev, active: source.label }));
                raw[source.key] = await source.load().catch(() => null);
                if (cancelled) return;
                setState((prev) => ({
                    ...prev,
                    done: [...prev.done, source.label],
                }));
            }

            const missing = Object.entries(REQUIRED)
                .filter(([key]) => !raw[key]?.length)
                .map(([, label]) => label);

            const weekMap = new Map();
            mergeInto(weekMap, raw.registrations, (row) => ({
                registrations: row.registrations,
            }));
            mergeInto(weekMap, raw.wau, (row) => ({
                wau: row.active_users,
                payingUsers: row.paying_users,
                totalRequests: row.total_requests,
            }));
            mergeInto(weekMap, raw.usage, (row) => ({
                tokens: row.total_tokens,
                tokensPerUser: row.tokens_per_user,
                textRequests: row.text_requests,
                imageRequests: row.image_requests,
                costUsd: row.cost_usd,
            }));
            mergeInto(weekMap, raw.revenue, (row) => ({
                revenue: row.revenue,
                packPurchases: row.purchases,
            }));
            mergeInto(weekMap, raw.health, (row) => ({
                availability: row.availability,
                serverErrors5xx: row.server_errors_5xx,
                latencyP50: row.latency_p50_ms,
                latencyP95: row.latency_p95_ms,
            }));
            mergeInto(weekMap, raw.segments, (row) => ({
                byopUsers: row.byop_users,
                byopPollen: row.byop_pollen,
                otherUsers: row.other_users,
                otherPollen: row.other_pollen,
                byopUserPct: row.byop_user_pct,
                byopPollenPct: row.byop_pollen_pct,
            }));
            mergeInto(weekMap, raw.appSubmissions, (row) => ({
                appSubmissions: row.submitted,
            }));
            // Activations only annotate weeks another source already produced.
            for (const row of raw.activations ?? []) {
                const existing = weekMap.get(row.week);
                if (existing) existing.activations = row.activations;
            }

            // Pipes disagree on how far back they reach — registrations and
            // activations run to Oct 2025, the Tinybird pipes only cover the
            // last WEEKS. The table needs the window every source can fill;
            // the acquisition chart keeps the whole history.
            const allWeeks = [...weekMap.values()].sort((a, b) =>
                a.week.localeCompare(b.week),
            );
            const weeklyData = allWeeks.slice(-(WEEKS + 1));

            if (cancelled) return;
            setState((prev) => ({
                ...prev,
                loading: false,
                missing,
                weeklyData,
                allWeeks,
                retentionData: (raw.retention ?? []).map((row) => ({
                    cohort: row.cohort,
                    users: row.cohort_size,
                    w1: row.w1_retention,
                    w2: row.w2_retention,
                    w3: row.w3_retention,
                    w4: row.w4_retention,
                })),
                github: raw.github ?? { stars: 0, forks: 0 },
            }));
        }

        load();
        return () => {
            cancelled = true;
        };
    }, []);

    const partialWeekStart = currentWeekStart();
    const fullWeeks = state.weeklyData.filter(
        (week) => week.week !== partialWeekStart,
    );

    return {
        ...state,
        fullWeeks,
        historyWeeks: state.allWeeks.filter(
            (week) => week.week !== partialWeekStart,
        ),
        currentWeek: fullWeeks[fullWeeks.length - 1] || null,
        previousWeek: fullWeeks[fullWeeks.length - 2] || null,
    };
}
