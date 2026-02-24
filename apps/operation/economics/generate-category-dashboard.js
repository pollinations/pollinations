#!/usr/bin/env node

/**
 * Generate a Grafana dashboard for per-category economics analysis.
 *
 * Reads apps/APPS.md to build category mappings (GitHub_UserID → Category,
 * BYOP hostname → Category), then generates a dashboard JSON with inline
 * ClickHouse transform() lookups.
 *
 * IMPORTANT: All SQL must query generation_event directly (no subqueries).
 * Tinybird scoped tokens don't allow subqueries on datasources.
 *
 * Usage: node apps/operation/economics/generate-category-dashboard.js
 */

const fs = require("fs");
const path = require("path");

const APPS_FILE = path.resolve(__dirname, "../../APPS.md");
const OUTPUT_FILE = path.resolve(
    __dirname,
    "provisioning/dashboards/category-economics.json",
);

const CATEGORY_META = {
    image: { emoji: "\u{1f5bc}\ufe0f", label: "Image" },
    video_audio: { emoji: "\u{1f3ac}", label: "Video & Audio" },
    writing: { emoji: "\u270d\ufe0f", label: "Write" },
    chat: { emoji: "\u{1f4ac}", label: "Chat" },
    games: { emoji: "\u{1f3ae}", label: "Play" },
    learn: { emoji: "\u{1f4da}", label: "Learn" },
    bots: { emoji: "\u{1f916}", label: "Bots" },
    build: { emoji: "\u{1f6e0}\ufe0f", label: "Build" },
    business: { emoji: "\u{1f4bc}", label: "Business" },
};

const CH_DATASOURCE = {
    type: "grafana-clickhouse-datasource",
    uid: "PAD1A0A25CD30D456",
};

// Standard data quality filters (from existing dashboards)
const FILTERS =
    "$__timeFilter(start_time)\n  AND environment = 'production'\n  AND response_status >= 200 AND response_status < 300\n  AND total_price > 0\n  AND user_github_id != '241978997'\n  AND (start_time < toDateTime('2025-12-30 16:59:45') OR start_time > toDateTime('2026-01-08 18:19:58'))";

// ---------------------------------------------------------------------------
// Parse APPS.md
// ---------------------------------------------------------------------------

function extractHostname(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return "";
    }
}

function parseAppsMarkdown() {
    const content = fs.readFileSync(APPS_FILE, "utf8");
    const lines = content.split("\n");

    const headerIdx = lines.findIndex((l) => l.startsWith("| Emoji"));
    if (headerIdx === -1) {
        console.error("Error: Could not find header row in APPS.md");
        process.exit(1);
    }

    const headers = lines[headerIdx].split("|").map((h) => h.trim());
    const col = (name) =>
        headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());

    const COL = {
        category: col("Category"),
        githubId: col("GitHub_UserID"),
        webUrl: col("Web_URL"),
        byop: col("BYOP"),
        requests: col("Requests_24h"),
        name: col("Name"),
    };

    const apps = [];
    for (let i = headerIdx + 2; i < lines.length; i++) {
        const line = lines[i];
        if (!line.startsWith("|")) continue;

        const cols = line.split("|").map((c) => c.trim());
        const category = (cols[COL.category] || "").trim();
        if (!category || !CATEGORY_META[category]) continue;

        apps.push({
            name: (cols[COL.name] || "").trim(),
            category,
            githubId: (cols[COL.githubId] || "").trim(),
            hostname: extractHostname((cols[COL.webUrl] || "").trim()),
            isBYOP: (cols[COL.byop] || "").trim() === "true",
            requests: parseInt((cols[COL.requests] || "0").trim(), 10) || 0,
        });
    }

    return apps;
}

// ---------------------------------------------------------------------------
// Build mappings
// ---------------------------------------------------------------------------

function buildMappings(apps) {
    const userApps = new Map();
    const hostnameToCategory = new Map();
    const categoryAppCounts = {};

    for (const app of apps) {
        categoryAppCounts[app.category] =
            (categoryAppCounts[app.category] || 0) + 1;

        if (app.githubId) {
            if (!userApps.has(app.githubId)) {
                userApps.set(app.githubId, []);
            }
            userApps
                .get(app.githubId)
                .push({ category: app.category, requests: app.requests });
        }

        if (app.isBYOP && app.hostname) {
            hostnameToCategory.set(app.hostname, app.category);
        }
    }

    const githubIdToCategory = new Map();
    for (const [id, list] of userApps) {
        list.sort((a, b) => b.requests - a.requests);
        githubIdToCategory.set(id, list[0].category);
    }

    return { githubIdToCategory, hostnameToCategory, categoryAppCounts };
}

// ---------------------------------------------------------------------------
// Build SQL fragments
// ---------------------------------------------------------------------------

function esc(s) {
    return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function buildTransformArrays(mapping) {
    const keys = [];
    const vals = [];
    for (const [k, v] of mapping) {
        keys.push(`'${esc(k)}'`);
        vals.push(`'${esc(v)}'`);
    }
    return { keys: keys.join(", "), vals: vals.join(", ") };
}

/**
 * Build the category assignment SQL expression.
 * BYOP: match hostname in api_key_name; otherwise match user_github_id.
 */
function buildCategoryExpr(githubIdToCategory, hostnameToCategory) {
    const gh = buildTransformArrays(githubIdToCategory);
    const hn = buildTransformArrays(hostnameToCategory);

    if (hn.keys) {
        return (
            `if(api_key_type = 'secret' AND api_key_name LIKE '%.%', ` +
            `transform(api_key_name, [${hn.keys}], [${hn.vals}], ''), ` +
            `transform(user_github_id, [${gh.keys}], [${gh.vals}], ''))`
        );
    }
    return `transform(user_github_id, [${gh.keys}], [${gh.vals}], '')`;
}

/**
 * Build Grafana value mappings for category column (raw key → emoji label).
 */
function buildCategoryValueMappings() {
    const options = {};
    for (const [key, meta] of Object.entries(CATEGORY_META)) {
        options[key] = {
            text: `${meta.emoji} ${meta.label}`,
            index: Object.keys(options).length,
        };
    }
    return [{ type: "value", options }];
}

// ---------------------------------------------------------------------------
// Dashboard panels
// ---------------------------------------------------------------------------

function statPanel(id, title, description, sql, gridPos, color, unit) {
    return {
        datasource: CH_DATASOURCE,
        description,
        fieldConfig: {
            defaults: {
                color: { fixedColor: color, mode: "fixed" },
                mappings: [],
                thresholds: {
                    mode: "absolute",
                    steps: [{ color, value: null }],
                },
                unit: unit || "currencyUSD",
            },
            overrides: [],
        },
        gridPos,
        id,
        options: {
            colorMode: "value",
            graphMode: "none",
            justifyMode: "auto",
            orientation: "auto",
            reduceOptions: {
                calcs: ["lastNotNull"],
                fields: "",
                values: false,
            },
            showPercentChange: false,
            textMode: "auto",
            wideLayout: true,
        },
        pluginVersion: "12.4.0",
        targets: [
            {
                datasource: CH_DATASOURCE,
                format: 0,
                rawSql: sql,
                refId: "A",
            },
        ],
        title,
        type: "stat",
    };
}

function buildPanels(categoryExpr, categoryAppCounts) {
    const panels = [];
    let nextId = 1;
    const valueMappings = buildCategoryValueMappings();

    // Row: Overview
    panels.push({
        collapsed: false,
        gridPos: { h: 1, w: 24, x: 0, y: 0 },
        id: nextId++,
        panels: [],
        title: "Category Economics Overview",
        type: "row",
    });

    // Stat: Total categorized pollen — flat query, no subquery
    panels.push(
        statPanel(
            nextId++,
            "Categorized Pollen",
            "Total pollen consumed by apps in known APPS.md categories.",
            `SELECT sumIf(total_price, ${categoryExpr} != '') as total\nFROM generation_event\nWHERE ${FILTERS}`,
            { h: 4, w: 6, x: 0, y: 1 },
            "green",
        ),
    );

    // Stat: Coverage %
    panels.push(
        statPanel(
            nextId++,
            "Coverage",
            "Percentage of total platform pollen attributable to known APPS.md apps.",
            `SELECT if(sum(total_price) > 0, sumIf(total_price, ${categoryExpr} != '') / sum(total_price), 0) as coverage\nFROM generation_event\nWHERE ${FILTERS}`,
            { h: 4, w: 4, x: 6, y: 1 },
            "blue",
            "percentunit",
        ),
    );

    // Stat: Tier pollen (subsidy cost)
    panels.push(
        statPanel(
            nextId++,
            "Tier \u03c1 (Subsidy)",
            "Free tier pollen consumed by categorized apps — this is our cost.",
            `SELECT sumIf(total_price, ${categoryExpr} != '' AND selected_meter_slug IN ('v1:meter:tier', 'local:tier')) as tier_cost\nFROM generation_event\nWHERE ${FILTERS}`,
            { h: 4, w: 5, x: 10, y: 1 },
            "orange",
        ),
    );

    // Stat: Pack pollen (revenue)
    panels.push(
        statPanel(
            nextId++,
            "Pack \u03c1 (Revenue)",
            "Paid pack pollen consumed by categorized apps — this is revenue.",
            `SELECT sumIf(total_price, ${categoryExpr} != '' AND selected_meter_slug IN ('v1:meter:pack', 'local:pack')) as pack_rev\nFROM generation_event\nWHERE ${FILTERS}`,
            { h: 4, w: 5, x: 15, y: 1 },
            "green",
        ),
    );

    // Stat: Known apps
    const totalApps = Object.values(categoryAppCounts).reduce(
        (a, b) => a + b,
        0,
    );
    panels.push(
        statPanel(
            nextId++,
            `${totalApps} Apps`,
            "Total apps tracked in APPS.md across all categories.",
            `SELECT ${totalApps} as apps`,
            { h: 4, w: 4, x: 20, y: 1 },
            "purple",
            "none",
        ),
    );

    // Row: Category P&L Table
    panels.push({
        collapsed: false,
        gridPos: { h: 1, w: 24, x: 0, y: 5 },
        id: nextId++,
        panels: [],
        title: "Category Contribution Margin",
        type: "row",
    });

    // App count static mapping (tiny, 15 entries)
    const catKeys = Object.keys(CATEGORY_META)
        .map((c) => `'${c}'`)
        .join(", ");
    const catCounts = Object.keys(CATEGORY_META)
        .map((c) => String(categoryAppCounts[c] || 0))
        .join(", ");

    // Table: Category P&L — flat query, GROUP BY + HAVING on computed alias
    panels.push({
        datasource: CH_DATASOURCE,
        description:
            "Per-category economics: tier pollen (subsidy cost) vs pack pollen (revenue). Subsidy rate = what fraction of consumption is free tier.",
        fieldConfig: {
            defaults: {
                color: { mode: "thresholds" },
                custom: {
                    align: "auto",
                    cellOptions: { type: "auto" },
                    filterable: true,
                    inspect: false,
                },
                mappings: [],
                thresholds: {
                    mode: "absolute",
                    steps: [{ color: "green", value: null }],
                },
            },
            overrides: [
                {
                    matcher: { id: "byName", options: "category" },
                    properties: [
                        { id: "displayName", value: "Category" },
                        { id: "custom.width", value: 160 },
                        { id: "mappings", value: valueMappings },
                    ],
                },
                {
                    matcher: { id: "byName", options: "apps" },
                    properties: [
                        { id: "displayName", value: "Apps" },
                        { id: "custom.width", value: 60 },
                    ],
                },
                {
                    matcher: { id: "byName", options: "tier_pollen" },
                    properties: [
                        { id: "displayName", value: "Tier \u03c1" },
                        { id: "unit", value: "currencyUSD" },
                        { id: "decimals", value: 2 },
                        { id: "custom.width", value: 100 },
                    ],
                },
                {
                    matcher: { id: "byName", options: "pack_pollen" },
                    properties: [
                        { id: "displayName", value: "Pack \u03c1" },
                        { id: "unit", value: "currencyUSD" },
                        { id: "decimals", value: 2 },
                        { id: "custom.width", value: 100 },
                    ],
                },
                {
                    matcher: { id: "byName", options: "total_pollen" },
                    properties: [
                        { id: "displayName", value: "Total \u03c1" },
                        { id: "unit", value: "currencyUSD" },
                        { id: "decimals", value: 2 },
                        { id: "custom.width", value: 110 },
                        {
                            id: "custom.cellOptions",
                            value: {
                                type: "color-background",
                                mode: "gradient",
                            },
                        },
                        {
                            id: "color",
                            value: { mode: "continuous-GrYlRd" },
                        },
                    ],
                },
                {
                    matcher: { id: "byName", options: "subsidy_rate" },
                    properties: [
                        { id: "displayName", value: "Subsidy %" },
                        { id: "unit", value: "percentunit" },
                        { id: "decimals", value: 0 },
                        { id: "custom.width", value: 100 },
                        {
                            id: "custom.cellOptions",
                            value: {
                                type: "color-background",
                                mode: "gradient",
                            },
                        },
                        {
                            id: "color",
                            value: { mode: "continuous-GrYlRd" },
                        },
                        { id: "min", value: 0 },
                        { id: "max", value: 1 },
                    ],
                },
                {
                    matcher: { id: "byName", options: "requests" },
                    properties: [
                        { id: "displayName", value: "Requests" },
                        { id: "custom.width", value: 90 },
                    ],
                },
                {
                    matcher: { id: "byName", options: "unique_users" },
                    properties: [
                        { id: "displayName", value: "Users" },
                        { id: "custom.width", value: 70 },
                    ],
                },
            ],
        },
        gridPos: { h: 14, w: 24, x: 0, y: 6 },
        id: nextId++,
        options: {
            cellHeight: "sm",
            footer: {
                countRows: false,
                enablePagination: false,
                fields: "",
                reducer: ["sum"],
                show: true,
            },
            showHeader: true,
            sortBy: [{ desc: true, displayName: "Total \u03c1" }],
        },
        pluginVersion: "12.4.0",
        targets: [
            {
                datasource: CH_DATASOURCE,
                format: 1,
                rawSql: [
                    "SELECT",
                    `  ${categoryExpr} as category,`,
                    `  transform(category, [${catKeys}], [${catCounts}], 0) as apps,`,
                    "  sumIf(total_price, selected_meter_slug IN ('v1:meter:tier', 'local:tier')) as tier_pollen,",
                    "  sumIf(total_price, selected_meter_slug IN ('v1:meter:pack', 'local:pack')) as pack_pollen,",
                    "  sum(total_price) as total_pollen,",
                    "  if(total_pollen > 0, tier_pollen / total_pollen, 0) as subsidy_rate,",
                    "  count() as requests,",
                    "  countDistinct(user_github_id) as unique_users",
                    "FROM generation_event",
                    `WHERE ${FILTERS}`,
                    "GROUP BY category",
                    "HAVING category != ''",
                    "ORDER BY total_pollen DESC",
                ].join("\n"),
                refId: "A",
            },
        ],
        title: "Category P&L",
        type: "table",
    });

    // Row: Distribution
    panels.push({
        collapsed: false,
        gridPos: { h: 1, w: 24, x: 0, y: 20 },
        id: nextId++,
        panels: [],
        title: "Distribution",
        type: "row",
    });

    // Pie chart: Total pollen by category
    panels.push({
        datasource: CH_DATASOURCE,
        description: "Share of total pollen consumed per category.",
        fieldConfig: {
            defaults: {
                color: { mode: "palette-classic" },
                mappings: valueMappings,
                unit: "currencyUSD",
            },
            overrides: [],
        },
        gridPos: { h: 10, w: 12, x: 0, y: 21 },
        id: nextId++,
        options: {
            displayLabels: ["name", "percent"],
            legend: {
                displayMode: "table",
                placement: "right",
                showLegend: true,
                values: ["value", "percent"],
            },
            pieType: "pie",
            reduceOptions: {
                calcs: ["lastNotNull"],
                fields: "",
                values: true,
            },
            tooltip: { mode: "single", sort: "none" },
        },
        pluginVersion: "12.4.0",
        targets: [
            {
                datasource: CH_DATASOURCE,
                format: 1,
                rawSql: [
                    "SELECT",
                    `  ${categoryExpr} as category,`,
                    "  sum(total_price) as pollen",
                    "FROM generation_event",
                    `WHERE ${FILTERS}`,
                    "GROUP BY category",
                    "HAVING category != ''",
                    "ORDER BY pollen DESC",
                ].join("\n"),
                refId: "A",
            },
        ],
        transformations: [
            {
                id: "rowsToFields",
                options: {
                    mappings: [
                        {
                            fieldName: "category",
                            handlerKey: "field.name",
                        },
                        { fieldName: "pollen", handlerKey: "field.value" },
                    ],
                },
            },
        ],
        title: "Pollen by Category",
        type: "piechart",
    });

    // Bar chart: Tier vs Pack per category (horizontal stacked)
    panels.push({
        datasource: CH_DATASOURCE,
        description:
            "Tier (free subsidy, orange) vs Pack (paid, green) per category. Categories with more green are more profitable.",
        fieldConfig: {
            defaults: {
                color: { mode: "palette-classic" },
                custom: {
                    axisBorderShow: false,
                    axisCenteredZero: false,
                    axisColorMode: "text",
                    axisPlacement: "auto",
                    fillOpacity: 80,
                    gradientMode: "none",
                    hideFrom: {
                        legend: false,
                        tooltip: false,
                        viz: false,
                    },
                    lineWidth: 1,
                    scaleDistribution: { type: "linear" },
                    thresholdsStyle: { mode: "off" },
                },
                mappings: [],
                thresholds: {
                    mode: "absolute",
                    steps: [{ color: "green", value: null }],
                },
                unit: "currencyUSD",
            },
            overrides: [
                {
                    matcher: { id: "byName", options: "tier_pollen" },
                    properties: [
                        { id: "displayName", value: "Tier \u03c1" },
                        {
                            id: "color",
                            value: {
                                fixedColor: "orange",
                                mode: "fixed",
                            },
                        },
                    ],
                },
                {
                    matcher: { id: "byName", options: "pack_pollen" },
                    properties: [
                        { id: "displayName", value: "Pack \u03c1" },
                        {
                            id: "color",
                            value: {
                                fixedColor: "green",
                                mode: "fixed",
                            },
                        },
                    ],
                },
            ],
        },
        gridPos: { h: 10, w: 12, x: 12, y: 21 },
        id: nextId++,
        options: {
            barRadius: 0.1,
            barWidth: 0.8,
            fullHighlight: false,
            groupWidth: 0.7,
            legend: {
                calcs: ["sum"],
                displayMode: "table",
                placement: "bottom",
                showLegend: true,
            },
            orientation: "horizontal",
            showValue: "auto",
            stacking: "normal",
            tooltip: { mode: "multi", sort: "desc" },
            xTickLabelRotation: 0,
            xTickLabelSpacing: 0,
        },
        pluginVersion: "12.4.0",
        targets: [
            {
                datasource: CH_DATASOURCE,
                format: 1,
                rawSql: [
                    "SELECT",
                    `  ${categoryExpr} as category,`,
                    "  sumIf(total_price, selected_meter_slug IN ('v1:meter:tier', 'local:tier')) as tier_pollen,",
                    "  sumIf(total_price, selected_meter_slug IN ('v1:meter:pack', 'local:pack')) as pack_pollen",
                    "FROM generation_event",
                    `WHERE ${FILTERS}`,
                    "GROUP BY category",
                    "HAVING category != ''",
                    "ORDER BY tier_pollen + pack_pollen DESC",
                ].join("\n"),
                refId: "A",
            },
        ],
        title: "Tier vs Pack by Category",
        type: "barchart",
    });

    // Row: Trends
    panels.push({
        collapsed: false,
        gridPos: { h: 1, w: 24, x: 0, y: 31 },
        id: nextId++,
        panels: [],
        title: "Trends",
        type: "row",
    });

    // Time series: Daily pollen by category — long format + Grafana pivot
    panels.push({
        datasource: CH_DATASOURCE,
        description:
            "Daily pollen consumption by category. Stacked to show total and relative contribution.",
        fieldConfig: {
            defaults: {
                color: { mode: "palette-classic" },
                custom: {
                    axisBorderShow: false,
                    axisCenteredZero: false,
                    axisColorMode: "text",
                    axisLabel: "Pollen",
                    axisPlacement: "left",
                    barAlignment: 0,
                    drawStyle: "bars",
                    fillOpacity: 80,
                    gradientMode: "none",
                    hideFrom: {
                        legend: false,
                        tooltip: false,
                        viz: false,
                    },
                    insertNulls: false,
                    lineInterpolation: "linear",
                    lineWidth: 1,
                    pointSize: 5,
                    scaleDistribution: { type: "linear" },
                    showPoints: "never",
                    spanNulls: false,
                    stacking: { group: "A", mode: "normal" },
                    thresholdsStyle: { mode: "off" },
                },
                mappings: [],
                thresholds: {
                    mode: "absolute",
                    steps: [{ color: "green", value: null }],
                },
                unit: "currencyUSD",
            },
            overrides: [],
        },
        gridPos: { h: 12, w: 24, x: 0, y: 32 },
        id: nextId++,
        options: {
            legend: {
                calcs: ["sum", "mean"],
                displayMode: "table",
                placement: "bottom",
                showLegend: true,
            },
            tooltip: { mode: "multi", sort: "desc" },
            xTickLabelRotation: 0,
            xTickLabelSpacing: 200,
        },
        pluginVersion: "12.4.0",
        targets: [
            {
                datasource: CH_DATASOURCE,
                format: 1,
                rawSql: [
                    "SELECT",
                    "  toStartOfInterval(start_time, INTERVAL 1 DAY) as time,",
                    `  ${categoryExpr} as category,`,
                    "  sum(total_price) as pollen",
                    "FROM generation_event",
                    `WHERE ${FILTERS}`,
                    "GROUP BY time, category",
                    "HAVING category != ''",
                    "ORDER BY time",
                ].join("\n"),
                refId: "A",
            },
        ],
        transformations: [
            {
                id: "prepareTimeSeries",
                options: { format: "many" },
            },
        ],
        title: "Daily Pollen by Category",
        type: "timeseries",
    });

    return panels;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
    console.log("Parsing APPS.md...");
    const apps = parseAppsMarkdown();
    console.log(`  Found ${apps.length} apps`);

    const { githubIdToCategory, hostnameToCategory, categoryAppCounts } =
        buildMappings(apps);
    console.log(
        `  GitHub ID mappings: ${githubIdToCategory.size} users \u2192 category`,
    );
    console.log(
        `  BYOP hostname mappings: ${hostnameToCategory.size} hostnames \u2192 category`,
    );

    // Log multi-category users
    const userApps = new Map();
    for (const app of apps) {
        if (app.githubId) {
            if (!userApps.has(app.githubId)) {
                userApps.set(app.githubId, new Set());
            }
            userApps.get(app.githubId).add(app.category);
        }
    }
    let multiCat = 0;
    for (const [, cats] of userApps) {
        if (cats.size > 1) multiCat++;
    }
    console.log(
        `  Multi-category users (resolved by highest requests): ${multiCat}`,
    );

    console.log("\nCategory distribution:");
    for (const [cat, count] of Object.entries(categoryAppCounts).sort(
        (a, b) => b[1] - a[1],
    )) {
        const meta = CATEGORY_META[cat];
        console.log(`  ${meta.emoji} ${meta.label}: ${count} apps`);
    }

    const categoryExpr = buildCategoryExpr(
        githubIdToCategory,
        hostnameToCategory,
    );
    const panels = buildPanels(categoryExpr, categoryAppCounts);

    const dashboard = {
        annotations: {
            list: [
                {
                    builtIn: 1,
                    datasource: { type: "grafana", uid: "-- Grafana --" },
                    enable: true,
                    hide: true,
                    iconColor: "rgba(0, 211, 255, 1)",
                    name: "Annotations & Alerts",
                    type: "dashboard",
                },
            ],
        },
        description:
            "Per-category contribution margin analysis: tier subsidy (cost) vs pack revenue by APPS.md category. Auto-generated from APPS.md mappings.",
        editable: true,
        fiscalYearStartMonth: 0,
        graphTooltip: 1,
        id: null,
        links: [],
        panels,
        schemaVersion: 40,
        tags: ["economics", "category", "apps"],
        templating: { list: [] },
        time: { from: "now-30d", to: "now" },
        timepicker: {},
        timezone: "utc",
        title: "Category Economics",
        uid: "category-economics",
        version: 1,
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(dashboard, null, 4) + "\n");
    console.log(`\nDashboard written to ${OUTPUT_FILE}`);
}

main();
