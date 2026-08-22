import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const [startArgument, endArgument, outputArgument, groupByArgument = ""] =
    process.argv.slice(2);
if (!startArgument || !endArgument || !outputArgument) {
    throw new Error(
        "Usage: node collect-anthropic-usage-report.mjs <YYYY-MM-DD> <YYYY-MM-DD> <output.json> [group-by-csv]",
    );
}

const apiKey = process.env.ANTHROPIC_ADMIN_KEY;
if (!apiKey) throw new Error("ANTHROPIC_ADMIN_KEY is missing");

const start = new Date(`${startArgument}T00:00:00.000Z`);
const end = new Date(`${endArgument}T00:00:00.000Z`);
if (
    Number.isNaN(start.valueOf()) ||
    Number.isNaN(end.valueOf()) ||
    start >= end
) {
    throw new Error("Invalid collection range");
}

const DAY_MS = 24 * 60 * 60 * 1000;
const groupBy = groupByArgument
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
const windows = [];
for (let cursor = start; cursor < end; ) {
    const windowEnd = new Date(
        Math.min(cursor.valueOf() + 7 * DAY_MS, end.valueOf()),
    );
    const url = new URL(
        "https://api.anthropic.com/v1/organizations/usage_report/messages",
    );
    url.searchParams.set("starting_at", cursor.toISOString());
    url.searchParams.set("ending_at", windowEnd.toISOString());
    url.searchParams.set("bucket_width", "1d");
    url.searchParams.set("limit", "31");
    for (const dimension of groupBy) {
        url.searchParams.append("group_by[]", dimension);
    }

    const response = await fetch(url, {
        headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
        },
    });
    if (!response.ok) {
        throw new Error(
            `Anthropic usage report failed for ${cursor.toISOString()}..${windowEnd.toISOString()}: HTTP ${response.status}`,
        );
    }
    const payload = await response.json();
    if (payload.has_more) {
        throw new Error(
            `Anthropic usage report paginated unexpectedly for ${cursor.toISOString()}..${windowEnd.toISOString()}`,
        );
    }
    windows.push({
        starting_at: cursor.toISOString(),
        ending_at: windowEnd.toISOString(),
        response: payload,
    });
    cursor = windowEnd;
}

const outputPath = resolve(outputArgument);
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
    outputPath,
    `${JSON.stringify(
        {
            collected_at: new Date().toISOString(),
            starting_at: start.toISOString(),
            ending_at: end.toISOString(),
            bucket_width: "1d",
            group_by: groupBy,
            windows,
        },
        null,
        2,
    )}\n`,
);

console.log(
    JSON.stringify({
        output: outputPath,
        windows: windows.length,
        buckets: windows.reduce(
            (sum, window) => sum + (window.response.data?.length ?? 0),
            0,
        ),
    }),
);
