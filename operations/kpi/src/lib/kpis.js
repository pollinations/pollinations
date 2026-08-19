// The KPI catalogue. Rows with `views` are the same measure in another
// unit and cycle in place; the rest have a single definition.
export const KPIS = [
    {
        key: "registrations",
        name: "New registrations",
        category: "Acquisition",
        tooltip:
            "Count of new user accounts created during the week. Source: D1 database (user.created_at)",
    },
    {
        key: "activations",
        category: "Acquisition",
        views: [
            {
                name: "Activated (D7)",
                tooltip:
                    "Users who made at least one API request within 7 days of registration. Source: D1 + Tinybird (generation_event_v2)",
            },
            {
                name: "D7 activation rate",
                format: "percent",
                calc: (w) => (w.activations / w.registrations) * 100,
                tooltip:
                    "Activated users / new registrations × 100. What share of signups become real users within 7 days.",
            },
        ],
    },
    {
        key: "wau",
        name: "WAU",
        category: "Usage",
        tooltip:
            "Weekly active users: unique users with at least one API request this week. Source: Tinybird (generation_event_v2)",
    },
    {
        key: "tokens",
        category: "Usage",
        format: "compact",
        views: [
            {
                name: "Total tokens",
                tooltip:
                    "Sum of prompt + completion tokens consumed. Source: Tinybird (weekly_usage_stats)",
            },
            {
                name: "Tokens/user",
                calc: (w) => w.tokens / w.wau,
                tooltip:
                    "Total tokens / WAU. Usage depth — how much each active user consumes on average.",
            },
        ],
    },
    {
        key: "revenue",
        category: "Revenue",
        format: "currency",
        views: [
            {
                name: "Revenue",
                tooltip:
                    "Gross USD from Pollen pack purchases. Source: Stripe checkout events in Tinybird.",
            },
            {
                name: "ARPA",
                calc: (w) => w.revenue / w.wau,
                tooltip:
                    "Weekly revenue / WAU. Average revenue per active user — monetization efficiency.",
            },
        ],
    },
    {
        key: "packPurchases",
        category: "Revenue",
        views: [
            {
                name: "Pack purchases",
                tooltip:
                    "Completed Pollen pack purchases this week. Source: Stripe checkout events in Tinybird.",
            },
            {
                name: "Purchase rate",
                format: "percent",
                calc: (w) => (w.packPurchases / w.wau) * 100,
                tooltip:
                    "Pack purchases / WAU × 100. Share of active users who bought a pack this week.",
            },
        ],
    },
    {
        key: "grossMargin",
        name: "Gross margin",
        category: "Efficiency",
        format: "percent",
        calc: (w) =>
            w.revenue > 0
                ? ((w.revenue - (w.costUsd || 0)) / w.revenue) * 100
                : null,
        tooltip:
            "(Revenue − COGS) / revenue × 100. COGS is compute cost from generation_event_v2.total_cost (GPU, tokens, providers).",
    },
    {
        key: "availability",
        category: "Health",
        views: [
            {
                name: "Service availability",
                format: "percent",
                tooltip:
                    "(Total − 5xx) / total × 100. User errors (4xx) do not count as downtime.",
            },
            {
                name: "5xx errors",
                calc: (w) => w.serverErrors5xx,
                tooltip:
                    "Server errors behind the availability figure. 90% availability reads mild; the same week in raw failed requests does not.",
            },
        ],
    },
    {
        key: "byopUserPct",
        name: "BYOP user %",
        category: "Segments",
        format: "percent",
        tooltip:
            "Share of active users from BYOP apps (app key attribution or hostname heuristic).",
    },
    {
        key: "byopPollenPct",
        name: "BYOP Pollen %",
        category: "Segments",
        format: "percent",
        tooltip:
            "Share of Pollen consumed by apps that bring their own Pollen.",
    },
    {
        key: "communityModels",
        category: "Ecosystem",
        format: "percent",
        views: [
            {
                key: "communityUserPct",
                name: "Community models · users",
                tooltip:
                    "Unique users making at least one final community-model request / weekly active users × 100. Status is ignored on the numerator, so a user whose only community call returned 4xx or 5xx still counts. Managed agents are community endpoints too, so their callers are included until agent attribution exists.",
            },
            {
                key: "communityRequestPct",
                name: "Community models · requests",
                tooltip:
                    "Successful (2xx) final community-model requests / all successful (2xx) final requests × 100. 4xx and 5xx are excluded from both sides. Final rows only, so a fallback-rescued request counts once, as one success. Includes top-level managed-agent runs until agent attribution exists.",
            },
            {
                key: "communityAvailability",
                name: "Community models · availability",
                tooltip:
                    "Community-model 2xx / (2xx + 5xx) × 100. 4xx is excluded from the denominator — auth, balance, rate-limit and bad-input errors are the caller's, not an endpoint being down. Includes top-level managed-agent runs until agent attribution exists.",
            },
        ],
    },
    {
        key: "appSubmissions",
        name: "App submissions",
        category: "Community",
        tooltip:
            "Issues opened this week with the APP-SUBMISSION label on pollinations/pollinations.",
    },
];

export function kpiValue(kpi, week) {
    return kpi.calc ? kpi.calc(week) : week[kpi.key];
}

/** The active definition of a row, given how many times it has been cycled. */
export function kpiView(row, index = 0) {
    return row.views ? { ...row, ...row.views[index % row.views.length] } : row;
}
