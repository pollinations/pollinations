#!/usr/bin/env node

/**
 * Crawl all app URLs from apps_urls.csv and produce a health report.
 *
 * Usage: node check-app-urls.js
 * Output: app_health_report.csv
 */

const fs = require("node:fs");
const https = require("node:https");
const http = require("node:http");

const INPUT = "apps_urls.csv";
const OUTPUT = "app_health_report.csv";
const CONCURRENCY = 10;
const TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

function parseCSV(text) {
    const [header, ...rows] = text.trim().split("\n");
    const keys = header.split(",");
    return rows.map((row) => {
        const vals = row.split(",");
        const obj = {};
        for (let i = 0; i < keys.length; i++) obj[keys[i]] = vals[i] || "";
        return obj;
    });
}

function fetchURL(url, redirectCount = 0) {
    return new Promise((resolve) => {
        if (redirectCount > 5) {
            resolve({ status: 0, error: "too_many_redirects", finalUrl: url });
            return;
        }

        const proto = url.startsWith("https") ? https : http;
        const req = proto.get(
            url,
            {
                timeout: TIMEOUT_MS,
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (compatible; PollinationsHealthCheck/1.0)",
                    Accept: "text/html,*/*",
                },
                rejectUnauthorized: false,
            },
            (res) => {
                res.resume(); // drain
                if (
                    [301, 302, 303, 307, 308].includes(res.statusCode) &&
                    res.headers.location
                ) {
                    let next = res.headers.location;
                    if (
                        next.startsWith("/") ||
                        next.startsWith("./") ||
                        next.startsWith("../")
                    ) {
                        try {
                            next = new URL(next, url).href;
                        } catch {
                            resolve({
                                status: res.statusCode,
                                error: null,
                                finalUrl: url,
                            });
                            return;
                        }
                    } else if (!next.startsWith("http")) {
                        try {
                            next = new URL(next, url).href;
                        } catch {
                            resolve({
                                status: res.statusCode,
                                error: null,
                                finalUrl: url,
                            });
                            return;
                        }
                    }
                    resolve(fetchURL(next, redirectCount + 1));
                } else {
                    resolve({
                        status: res.statusCode,
                        error: null,
                        finalUrl: url,
                    });
                }
            },
        );

        req.on("timeout", () => {
            req.destroy();
            resolve({ status: 0, error: "timeout", finalUrl: url });
        });

        req.on("error", (err) => {
            const msg = err.message || "";
            let errorType = "connection_error";
            if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo"))
                errorType = "dns_error";
            else if (
                msg.includes("certificate") ||
                msg.includes("SSL") ||
                msg.includes("TLS")
            )
                errorType = "ssl_error";
            else if (msg.includes("ECONNREFUSED"))
                errorType = "connection_refused";
            else if (msg.includes("ECONNRESET")) errorType = "connection_reset";
            else if (msg.includes("ETIMEDOUT")) errorType = "timeout";
            resolve({ status: 0, error: errorType, finalUrl: url });
        });
    });
}

async function checkWithRetry(url) {
    const start = Date.now();
    let result;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        result = await fetchURL(url);
        // Don't retry on definitive results
        if (result.status >= 200 && result.status < 500) break;
        if (result.error === "dns_error") break;
        if (attempt < MAX_RETRIES)
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
    result.responseTime = Date.now() - start;
    return result;
}

function classify(status, error) {
    if (error === "dns_error") return "dns_error";
    if (error === "ssl_error") return "ssl_error";
    if (error === "timeout") return "timeout";
    if (error === "too_many_redirects") return "manual_review";
    if (error) return "connection_error";
    if (status >= 200 && status < 300) return "working";
    if (status >= 300 && status < 400) return "redirect_working";
    if (status === 403 || status === 429) return "blocked_or_rate_limited";
    if (status === 404 || status === 410) return "not_found";
    if (status >= 500) return "server_error";
    return "manual_review";
}

async function main() {
    const rows = parseCSV(fs.readFileSync(INPUT, "utf8"));
    console.log(`Loaded ${rows.length} apps from ${INPUT}`);

    const results = [];
    let done = 0;

    async function processRow(row) {
        const url = row.web_url || row.github_repo_url;
        const source = row.web_url ? "web_url" : "github_repo_url";

        if (!url) {
            results.push({
                app_name: row.app_name,
                checked_url: "",
                checked_url_source: "none",
                final_url: "",
                http_status: 0,
                status_bucket: "no_url",
                response_time_ms: 0,
                error_type: "no_url",
                github_username: row.github_username,
                github_user_id: row.github_user_id,
            });
            return;
        }

        // Ensure protocol
        let checkedUrl = url;
        if (!checkedUrl.startsWith("http"))
            checkedUrl = `https://${checkedUrl}`;

        const result = await checkWithRetry(checkedUrl);
        const bucket = classify(result.status, result.error);

        done++;
        if (done % 25 === 0 || done === rows.length) {
            const pct = ((done / rows.length) * 100).toFixed(0);
            console.log(
                `  ${done}/${rows.length} (${pct}%) — last: ${row.app_name} → ${bucket}`,
            );
        }

        results.push({
            app_name: row.app_name,
            checked_url: checkedUrl,
            checked_url_source: source,
            final_url: result.finalUrl || "",
            http_status: result.status,
            status_bucket: bucket,
            response_time_ms: result.responseTime,
            error_type: result.error || "",
            github_username: row.github_username,
            github_user_id: row.github_user_id,
        });
    }

    // Run with concurrency limit
    const queue = [...rows];
    const workers = Array.from({ length: CONCURRENCY }, async () => {
        while (queue.length) {
            const row = queue.shift();
            await processRow(row);
        }
    });
    await Promise.all(workers);

    // Sort by bucket for easy review
    results.sort((a, b) => a.status_bucket.localeCompare(b.status_bucket));

    // Write CSV
    const header =
        "app_name,checked_url,checked_url_source,final_url,http_status,status_bucket,response_time_ms,error_type,github_username,github_user_id";
    const csvRows = results.map((r) =>
        [
            `"${(r.app_name || "").replace(/"/g, '""')}"`,
            `"${r.checked_url}"`,
            r.checked_url_source,
            `"${r.final_url}"`,
            r.http_status,
            r.status_bucket,
            r.response_time_ms,
            r.error_type,
            r.github_username,
            r.github_user_id,
        ].join(","),
    );

    fs.writeFileSync(OUTPUT, [header, ...csvRows].join("\n"));

    // Summary
    const buckets = {};
    for (const r of results) {
        buckets[r.status_bucket] = (buckets[r.status_bucket] || 0) + 1;
    }

    console.log(`\n=== HEALTH REPORT ===`);
    console.log(`Total: ${results.length}`);
    for (const [bucket, count] of Object.entries(buckets).sort(
        (a, b) => b[1] - a[1],
    )) {
        const pct = ((count / results.length) * 100).toFixed(1);
        console.log(`  ${bucket}: ${count} (${pct}%)`);
    }

    const zombies =
        (buckets.not_found || 0) +
        (buckets.dns_error || 0) +
        (buckets.server_error || 0) +
        (buckets.ssl_error || 0) +
        (buckets.connection_error || 0);
    const rate = ((zombies / results.length) * 100).toFixed(1);
    console.log(`\nzombie_rate = ${zombies}/${results.length} = ${rate}%`);
    console.log(
        `(not_found + dns_error + server_error + ssl_error + connection_error)`,
    );
    console.log(
        `\nExcluded from zombie count: blocked_or_rate_limited, timeout, manual_review`,
    );
    console.log(`\nWritten to ${OUTPUT}`);
}

main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
});
