// Pollen revenue against compute cost: same traffic, same week, so the ratio is
// a unit economic. Stripe cash is a different question — see coverage().
const margin = (week) =>
    week.pollenRevenue > 0
        ? ((week.pollenRevenue - week.costUsd) / week.pollenRevenue) * 100
        : null;

// Cash in against cost incurred. The two are not matched — packs are bought in
// one week and burned over later ones — so this is a coverage ratio, not margin.
const coverage = (week) =>
    week.allTrafficCostUsd > 0 && Number.isFinite(week.revenue)
        ? (week.revenue / week.allTrafficCostUsd) * 100
        : null;

const failuresPerThousand = (availability) =>
    Number.isFinite(availability) ? (100 - availability) * 10 : null;

// The KPI catalogue. Rows with `views` are the same measure in another
// unit or quantity and cycle in place; the rest have a single definition.
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
        category: "Usage",
        views: [
            {
                name: "WAU",
                tooltip:
                    "Unique users we served this week — at least one request that was not rejected for insufficient Pollen. A 402 never reaches a provider and is never billed, so it does not make someone an active user. Source: Tinybird (weekly_active_users).",
            },
            {
                key: "wauAll",
                name: "WAU · incl. rejected",
                tooltip:
                    "Every unique user who sent a request, including those whose only requests came back 402 for insufficient Pollen. This is the figure the dashboard showed before; it runs roughly twice the served count and has stayed flat while the served base halved.",
            },
        ],
    },
    {
        key: "turnedAway",
        name: "Turned away",
        category: "Usage",
        calc: (w) => w.wauAll - w.wau,
        tooltip:
            "Users whose every request this week was rejected for insufficient Pollen (WAU incl. rejected − WAU). Demand that reached the Pollen wall and got nothing.",
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
                key: "pollenRevenue",
                name: "Pollen spent",
                tooltip:
                    "USD value of Pollen consumed by generation requests this week, across Paid and Quest balances. Source: Tinybird (weekly_usage_stats).",
            },
            {
                name: "ARPA · all traffic",
                calc: (w) => w.revenue / w.allTrafficWau,
                tooltip:
                    "Stripe cash revenue / served accounts across all traffic groups. Includes legacy shared accounts and internal accounts; not regular-user monetization.",
            },
        ],
    },
    {
        key: "pollenByCategory",
        category: "Usage",
        format: "currency",
        views: [
            ["pollenText", "Text"],
            ["pollenImage", "Image"],
            ["pollenVideo", "Video"],
            ["pollenAudio", "Audio"],
            ["pollenRealtime", "Realtime"],
            ["pollenEmbedding", "Embeddings"],
            ["pollen3d", "3D"],
            ["pollenCommunity", "Community"],
            ["pollenOther", "Tools / other"],
        ].map(([key, label]) => ({
            key,
            label,
            name: `Pollen spent · ${label}`,
            tooltip:
                "USD value of Paid + Quest Pollen consumed by successful billed final requests. Whole-request spend, not Stripe cash revenue or provider cost. Categories use recorded output usage and endpoint: video takes priority over audio, then image, then text; realtime, embeddings and 3D are separate. Community-served requests are in Community only. Tools / other includes MCP. Source: Tinybird (weekly_usage_stats).",
        })),
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
                name: "Purchases / accounts · all traffic",
                format: "percent",
                calc: (w) => (w.packPurchases / w.allTrafficWau) * 100,
                tooltip:
                    "Pack purchases / served accounts across all traffic groups × 100. Purchases and activity are not matched by account; this is not a buyer conversion rate.",
            },
        ],
    },
    {
        key: "paidPollenPct",
        name: "Paid Pollen share",
        category: "Revenue",
        format: "percentPrecise",
        tooltip:
            "Paid Pollen spent / (Paid + Quest Pollen spent) × 100. Tracks how much generation consumption is funded by purchased credit. Source: Tinybird (weekly_usage_stats).",
    },
    {
        key: "grossMargin",
        name: "Gross margin",
        category: "Efficiency",
        format: "percent",
        calc: margin,
        tooltip:
            "(Pollen revenue − compute cost) / Pollen revenue × 100. Pollen revenue is the USD value of Pollen actually spent this week — Quest and Paid buckets alike — so it covers the same traffic the cost does. Cost is modelled from the registry rate cards, not from invoices, and vendor credits are ignored: a provider we are billed for in grant dollars still counts at list price. Self-hosted GPU is charged per request, so idle fleet capacity is not in it.",
    },
    {
        key: "cashCoverage",
        name: "Cash coverage · all traffic",
        category: "Efficiency",
        format: "percent",
        calc: coverage,
        tooltip:
            "Stripe pack revenue / compute cost across all traffic groups × 100. Above 100%, the packs sold this week pay for the week's compute. Not a margin: packs are bought once and burned over later weeks, so this bounces with purchase timing. Stripe fees are not deducted.",
    },
    {
        key: "availability",
        category: "Health",
        views: [
            {
                name: "Server errors / 1K",
                format: "perThousand",
                lowerIsBetter: true,
                calc: (w) => failuresPerThousand(w.availability),
                tooltip:
                    "Non-community 5xx / (2xx + 5xx) × 1,000. A normalized failure rate that stays comparable as traffic changes. Community models have a separate KPI; user errors (4xx) are excluded.",
            },
            {
                name: "Service availability",
                format: "percentPrecise",
                tooltip:
                    "Non-community 2xx / (2xx + 5xx) × 100. Community models have a separate availability KPI; user errors (4xx) are excluded because they do not indicate service downtime.",
            },
            {
                name: "5xx errors",
                lowerIsBetter: true,
                calc: (w) => w.serverErrors5xx,
                tooltip:
                    "Non-community server errors behind the availability figure. Community-model errors are excluded and reported separately.",
            },
        ],
    },
    {
        key: "byopUserPct",
        category: "Segments",
        format: "percent",
        views: [
            {
                name: "BYOP user %",
                tooltip:
                    "Share of served users on BYOP keys. Users whose only requests were rejected for insufficient Pollen are excluded from both sides.",
            },
            {
                key: "byopUserPctAll",
                name: "BYOP user % · incl. rejected",
                tooltip:
                    "The same share counting users whose every request came back 402. BYOP keys hit the Pollen wall more often than others, so this reads several points higher.",
            },
        ],
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
                    "Unique users making at least one final community-model request / WAU × 100. Both sides exclude users rejected for insufficient Pollen, so this is a share of people we served. Other 4xx and 5xx still count on the numerator. Managed agents are community endpoints too, so their callers are included until agent attribution exists.",
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
                format: "percentPrecise",
                tooltip:
                    "Community-model 2xx / (2xx + 5xx) × 100. 4xx is excluded from the denominator — auth, balance, rate-limit and bad-input errors are the caller's, not an endpoint being down. Includes top-level managed-agent runs until agent attribution exists.",
            },
        ],
    },
    {
        key: "agentUsage",
        category: "Ecosystem",
        views: [
            {
                key: "agentRequests",
                name: "Agents · observed runs",
                tooltip:
                    "Distinct top-level agent runs with at least one recorded internal model/tool call, linked by the verified run token's parent request ID. All outcomes count. Excludes ordinary community models, nested runs, cache hits, and runs with no recorded child call. Comparable history starts Aug 24, 2026; earlier weeks show —. Source: Tinybird (weekly_agent_mcp_usage).",
            },
            {
                key: "agentUsers",
                name: "Agents · unique users",
                tooltip:
                    "Distinct authenticated users of observed top-level agent runs, deduplicated across agents. Only runs with a recorded internal model/tool call are covered; excludes ordinary community models, nested runs, and cache hits. Comparable history starts Aug 24, 2026; earlier weeks show —.",
            },
        ],
    },
    {
        key: "mcpUsage",
        category: "Ecosystem",
        views: [
            {
                key: "mcpCalls",
                name: "MCP · recorded calls",
                tooltip:
                    "Recorded MCP tool calls through Gen: Exa, FFmpeg, Computer, and Composio. Includes calls inside agents and recorded errors. Excludes Pollinations' own MCP server, discovery calls, and failures before a usage receipt. Not total MCP traffic. Source: Tinybird (weekly_agent_mcp_usage).",
            },
            {
                key: "mcpUsers",
                name: "MCP · unique users",
                tooltip:
                    "Distinct authenticated users of recorded MCP tool calls, deduplicated across Exa, FFmpeg, Computer, and Composio. Includes calls inside agents. Pollinations' own MCP server and discovery calls are not covered.",
            },
        ],
    },
    {
        key: "legacyUsage",
        category: "Legacy APIs",
        format: "compact",
        views: [
            {
                key: "legacyRequests",
                name: "Legacy API · requests",
                tooltip:
                    "Requests through the shared legacy image and text API keys, including rejections. Separate from every regular-user usage metric; shared keys cannot establish end-user counts.",
            },
            {
                key: "legacySuccesses",
                name: "Legacy API · successful",
                tooltip:
                    "Successful (HTTP 2xx), non-cached final requests through the legacy image and text API keys. Excluded from regular-user usage, health and Pollen metrics.",
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

export const POLLEN_CATEGORIES = KPIS.find(
    (row) => row.key === "pollenByCategory",
).views;

export function pollenSpendSeries(weeks, selected = "top") {
    if (selected !== "top")
        return POLLEN_CATEGORIES.filter((view) => view.key === selected);
    const latest = weeks.at(-1) ?? {};
    return POLLEN_CATEGORIES.filter(
        ({ key }) =>
            key !== "pollenCommunity" &&
            key !== "pollenOther" &&
            Number.isFinite(latest[key]),
    )
        .sort((a, b) => latest[b.key] - latest[a.key])
        .slice(0, 3);
}

/** The active definition of a row, given how many times it has been cycled. */
export function kpiView(row, index = 0) {
    return row.views ? { ...row, ...row.views[index % row.views.length] } : row;
}

/** The id the explorer uses to name one specific view of one row. */
export function kpiViewId(row, index = 0) {
    return `${row.key}:${row.views ? index % row.views.length : 0}`;
}

// Every view of every row as its own entry. The table cycles units in place to
// stay compact; the graph has room to list them all, so a variant is reachable
// there without cycling the table to it first.
export const KPI_VIEWS = KPIS.flatMap((row) =>
    (row.views ?? [null]).map((_, index) => ({
        id: kpiViewId(row, index),
        ...kpiView(row, index),
    })),
);

export function kpiViewById(id) {
    return KPI_VIEWS.find((view) => view.id === id) ?? KPI_VIEWS[0];
}
