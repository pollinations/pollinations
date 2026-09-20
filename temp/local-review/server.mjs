import { readFileSync } from "node:fs";
import { createServer, request } from "node:http";
import { connect } from "node:net";

const fixture = JSON.parse(
    readFileSync(new URL("./activity-fixture.json", import.meta.url), "utf8"),
);
const reviewOrigin = "http://localhost:3020";
const appOrigin = "http://localhost:3000";
const fixturePaths = new Set([
    "/api/account/usage/daily",
    "/api/account/earnings",
    "/api/account/usage",
    "/api/account/earnings/transactions",
]);

function selectedRows(rows, url) {
    const period = url.searchParams.get("period");
    const granularity = url.searchParams.get("granularity");
    const filtered = period
        ? rows.filter((row) => row.date.startsWith(period))
        : rows;
    if (granularity !== "month") return filtered;
    const grouped = new Map();
    for (const row of filtered) {
        const day = row.date.slice(0, 10);
        const key = JSON.stringify([
            day,
            row.api_key_id,
            row.model,
            row.meter_source,
            row.entity_id,
        ]);
        const current = grouped.get(key);
        if (!current) {
            grouped.set(key, { ...row, date: day });
            continue;
        }
        for (const field of [
            "requests",
            "cost_usd",
            "paid_requests",
            "tier_requests",
            "baseline_price",
            "pollen_earned",
            "paid_earned",
            "tier_earned",
        ])
            if (typeof row[field] === "number") current[field] += row[field];
    }
    return [...grouped.values()];
}

function earningsRollup(rows) {
    const byEntity = new Map();
    for (const row of rows) {
        const key = `${row.source}:${row.entity_id}`;
        const current = byEntity.get(key);
        if (!current) {
            byEntity.set(key, { ...row, date: "" });
            continue;
        }
        for (const field of [
            "requests",
            "paid_requests",
            "tier_requests",
            "baseline_price",
            "pollen_earned",
            "paid_earned",
            "tier_earned",
            "cost_usd",
        ])
            current[field] += row[field];
    }
    return [...byEntity.values()];
}

function eventRows(rows, url) {
    const limit = Number(url.searchParams.get("limit") || 100);
    const before = url.searchParams.get("before");
    return rows
        .filter((row) => !before || row.timestamp < before)
        .slice(0, Number.isFinite(limit) ? Math.max(0, limit) : 100);
}

function csv(rows) {
    if (!rows.length) return "";
    const columns = Object.keys(rows[0]);
    const cell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const lines = [
        columns.join(","),
        ...rows.map((row) => columns.map((key) => cell(row[key])).join(",")),
    ];
    return `${lines.join("\n")}\n`;
}

function serveFixture(res, url) {
    const path = url.pathname;
    const dailyUsage = selectedRows(fixture.daily_usage, url);
    const dailyEarnings = selectedRows(fixture.daily_earnings, url);
    const usage = eventRows(fixture.usage_events, url);
    const transactions = eventRows(fixture.earnings_events, url);
    const result =
        path === "/api/account/usage/daily"
            ? { usage: dailyUsage, count: dailyUsage.length }
            : path === "/api/account/earnings"
              ? {
                    daily: dailyEarnings,
                    perEntity: earningsRollup(dailyEarnings),
                }
              : path === "/api/account/usage"
                ? { usage, count: usage.length }
                : { transactions, count: transactions.length };
    const asCsv = url.searchParams.get("format") === "csv";
    const body = asCsv
        ? csv(
              path === "/api/account/usage/daily"
                  ? dailyUsage
                  : path === "/api/account/earnings"
                    ? dailyEarnings
                    : path === "/api/account/usage"
                      ? usage
                      : transactions,
          )
        : JSON.stringify(result);
    res.writeHead(200, {
        "content-type": asCsv
            ? "text/csv; charset=utf-8"
            : "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-pollinations-local-fixture": fixture.kind,
    });
    res.end(body);
}

const server = createServer((req, res) => {
    const url = new URL(req.url || "/", reviewOrigin);
    const referer = req.headers.referer || "";
    if (
        req.method === "GET" &&
        fixturePaths.has(url.pathname) &&
        referer.startsWith(`${reviewOrigin}/activity`)
    ) {
        serveFixture(res, url);
        return;
    }
    const headers = { ...req.headers, host: "localhost:3000" };
    if (headers.origin)
        headers.origin = headers.origin.replace(reviewOrigin, appOrigin);
    if (headers.referer)
        headers.referer = headers.referer.replace(reviewOrigin, appOrigin);
    const upstream = request(
        {
            hostname: "localhost",
            port: 3000,
            path: req.url,
            method: req.method,
            headers,
        },
        (response) => {
            const responseHeaders = { ...response.headers };
            if (responseHeaders.location)
                responseHeaders.location = responseHeaders.location.replace(
                    appOrigin,
                    reviewOrigin,
                );
            res.writeHead(response.statusCode || 502, responseHeaders);
            response.pipe(res);
        },
    );
    upstream.on("error", () => {
        res.writeHead(502);
        res.end("Local Enter server is unavailable");
    });
    req.pipe(upstream);
});

server.on("upgrade", (req, socket, head) => {
    const upstream = connect(3000, "localhost", () => {
        const headers = { ...req.headers, host: "localhost:3000" };
        upstream.write(
            `${req.method} ${req.url} HTTP/1.1\r\n${Object.entries(headers)
                .map(([name, value]) => `${name}: ${value}`)
                .join("\r\n")}\r\n\r\n`,
        );
        if (head.length) upstream.write(head);
        socket.pipe(upstream).pipe(socket);
    });
    upstream.on("error", () => socket.destroy());
});

server.listen(3020, "::1", () => {
    process.stdout.write(
        `Local review: ${reviewOrigin}/activity?usageGranularity=day&usagePeriod=${fixture.frozen_at}&earningsGranularity=day&earningsPeriod=${fixture.frozen_at}\n`,
    );
});
