#!/usr/bin/env node

const { readApps } = require("./app.js");

const CONCURRENCY = 10;

async function consume(response) {
    if (!response.body) return;
    await response.body.pipeTo(new WritableStream());
}

async function keepalive(apps, fetchMedia = fetch, runId = Date.now()) {
    const urls = [
        ...new Set(apps.map((app) => app.screenshotUrl).filter(Boolean)),
    ];
    const failures = [];
    let nextIndex = 0;

    async function worker() {
        while (nextIndex < urls.length) {
            const index = nextIndex++;
            const sourceUrl = urls[index];
            const url = new URL(sourceUrl);
            url.searchParams.set("keepalive", String(runId));

            try {
                const response = await fetchMedia(url, {
                    cache: "no-store",
                    headers: { "Cache-Control": "no-cache" },
                });
                if (!response.ok) {
                    failures.push(`${sourceUrl}: HTTP ${response.status}`);
                    continue;
                }
                await consume(response);
            } catch (error) {
                failures.push(
                    `${sourceUrl}: ${error instanceof Error ? error.message : String(error)}`,
                );
            }
        }
    }

    await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker),
    );

    if (failures.length) {
        throw new Error(
            `Failed to refresh ${failures.length} of ${urls.length} screenshot(s):\n${failures.join("\n")}`,
        );
    }

    return urls.length;
}

async function main() {
    const count = await keepalive(readApps());
    console.log(`Refreshed ${count} community app screenshot(s)`);
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    });
}

module.exports = { keepalive };
