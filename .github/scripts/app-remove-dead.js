#!/usr/bin/env node

/**
 * Check all app URLs in apps/APPS.md and remove confirmed dead ones.
 *
 * Checks every app URL 3 times with a 5-minute delay between rounds.
 * Only removes apps that return 404/410 in ALL 3 rounds.
 * Edits APPS.md in place — the calling workflow handles git/PR.
 *
 * Usage: node .github/scripts/app-remove-dead.js [--dry-run] [--verbose]
 */

const fs = require("node:fs");
const { execFile } = require("node:child_process");

const APPS_FILE = "apps/APPS.md";
const ROUNDS = 3;
const DELAY_MS = 5 * 60 * 1000; // 5 minutes between rounds
const CONCURRENCY = 30;
const TIMEOUT_MS = 10000;
const DEAD_CODES = new Set([404, 410]);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");

function parseApps() {
    const content = fs.readFileSync(APPS_FILE, "utf8");
    const lines = content.split("\n");
    const headerIdx = lines.findIndex((l) => l.startsWith("| Emoji"));
    if (headerIdx === -1) {
        console.error("Could not find header row in APPS.md");
        process.exit(1);
    }

    const apps = [];
    for (let i = headerIdx + 2; i < lines.length; i++) {
        const line = lines[i];
        if (!line.startsWith("|")) continue;

        const cols = line
            .split("|")
            .slice(1, -1)
            .map((c) => c.trim());
        if (cols.length < 15) continue;

        const name = cols[1];
        const webUrl = cols[2];
        const repo = cols[9] || "";
        // Use web URL if available, otherwise fall back to repo URL
        const url = webUrl?.startsWith("http")
            ? webUrl
            : repo?.startsWith("http")
              ? repo
              : null;
        apps.push({ lineIndex: i, name, url });
    }

    return { apps, lines };
}

function checkUrl(url) {
    return new Promise((resolve) => {
        if (!url || !url.startsWith("http")) {
            resolve({ code: "skip" });
            return;
        }

        execFile(
            "curl",
            [
                "-s",
                "-o",
                "/dev/null",
                "-w",
                "%{http_code}",
                "-L",
                "-k",
                "--connect-timeout",
                "5",
                "--max-time",
                String(TIMEOUT_MS / 1000),
                "-H",
                "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "-H",
                "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                url,
            ],
            { timeout: TIMEOUT_MS + 5000 },
            (err, stdout) => {
                if (err) {
                    resolve({ code: "error" });
                    return;
                }
                const code = parseInt(stdout.trim(), 10);
                resolve({ code: Number.isNaN(code) ? "error" : code });
            },
        );
    });
}

async function runWithConcurrency(tasks, limit) {
    const results = new Array(tasks.length);
    let nextIdx = 0;
    async function worker() {
        while (nextIdx < tasks.length) {
            const idx = nextIdx++;
            results[idx] = await tasks[idx]();
        }
    }
    await Promise.all(
        Array.from({ length: Math.min(limit, tasks.length) }, () => worker()),
    );
    return results;
}

async function checkAllApps(apps, round) {
    console.log(`\n=== Round ${round}/${ROUNDS} ===`);
    let done = 0;

    const tasks = apps.map((app) => async () => {
        const result = await checkUrl(app.url);
        done++;
        if (!verbose) {
            process.stdout.write(
                `\rProgress: ${done}/${apps.length} (${Math.round((done / apps.length) * 100)}%)`,
            );
        } else {
            const icon = DEAD_CODES.has(result.code) ? "❌" : "✅";
            console.log(`  ${icon} ${result.code} | ${app.name} | ${app.url}`);
        }
        return { app, code: result.code };
    });

    const results = await runWithConcurrency(tasks, CONCURRENCY);
    if (!verbose) console.log("");

    return results;
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function main() {
    console.log("🔗 Dead App Checker\n");

    const { apps, lines } = parseApps();
    const appsWithUrls = apps.filter((a) => a.url?.startsWith("http"));
    console.log(`Found ${appsWithUrls.length} apps with URLs to check`);

    // Track how many times each app returns a dead code
    const failCounts = new Map();
    for (const app of appsWithUrls) {
        failCounts.set(app.lineIndex, 0);
    }

    for (let round = 1; round <= ROUNDS; round++) {
        const results = await checkAllApps(appsWithUrls, round);

        for (const { app, code } of results) {
            if (DEAD_CODES.has(code)) {
                failCounts.set(
                    app.lineIndex,
                    failCounts.get(app.lineIndex) + 1,
                );
            }
        }

        if (round < ROUNDS) {
            console.log(`Waiting ${DELAY_MS / 1000}s before next round...`);
            await sleep(DELAY_MS);
        }
    }

    // Only remove apps that failed ALL rounds
    const deadApps = appsWithUrls.filter(
        (app) => failCounts.get(app.lineIndex) === ROUNDS,
    );

    console.log(`\n📊 Results`);
    console.log(`  Total checked: ${appsWithUrls.length}`);
    console.log(`  Dead (${ROUNDS}/${ROUNDS} rounds): ${deadApps.length}`);

    if (deadApps.length === 0) {
        console.log("\n✅ No dead apps found.");
        return;
    }

    console.log("\n🗑️  Dead apps:");
    for (const app of deadApps) {
        console.log(`  ${app.name} | ${app.url}`);
    }

    if (dryRun) {
        console.log("\n--dry-run: not creating PR");
        return;
    }

    // Remove dead app lines from APPS.md
    const deadLineIndices = new Set(deadApps.map((a) => a.lineIndex));
    const newLines = lines.filter((_, idx) => !deadLineIndices.has(idx));
    fs.writeFileSync(APPS_FILE, newLines.join("\n"));
    console.log(`\nRemoved ${deadApps.length} apps from APPS.md`);
}

main().catch((err) => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
});
