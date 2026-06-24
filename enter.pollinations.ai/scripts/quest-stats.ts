#!/usr/bin/env node
/**
 * Print per-quest statistics (earned / claimed / unclaimed / Pollen) by reading
 * the public quest catalog, which the worker computes from the rewards ledger.
 *
 * All computation lives in enter (src/routes/quests.ts -> quest-stats.ts); this
 * script just fetches /api/quests/catalog and tabulates the `stats` block, so it
 * never duplicates the reward-accounting logic.
 *
 * Usage:
 *   node scripts/quest-stats.ts                       # prod (default)
 *   node scripts/quest-stats.ts --base http://localhost:3000
 *   node scripts/quest-stats.ts --json                # raw JSON
 */

type QuestCardStats = {
    earned: number;
    claimed: number;
    unclaimed: number;
    pollenAwarded: number;
    pollenClaimed: number;
};

type QuestCatalogItem = {
    id: string;
    title: string;
    category: string;
    rewardAmount: number | null;
    availability: string;
    stats: QuestCardStats;
};

const DEFAULT_BASE = "https://enter.pollinations.ai";

function parseArgs(argv: string[]): { base: string; json: boolean } {
    let base = DEFAULT_BASE;
    let json = false;
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--base") base = argv[++i] ?? base;
        else if (argv[i] === "--json") json = true;
    }
    return { base: base.replace(/\/$/, ""), json };
}

function pad(value: string | number, width: number, right = false): string {
    const s = String(value);
    return right ? s.padStart(width) : s.padEnd(width);
}

async function main(): Promise<void> {
    const { base, json } = parseArgs(process.argv.slice(2));
    const url = `${base}/api/quests/catalog`;

    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`GET ${url} -> ${res.status} ${await res.text()}`);
    }
    const { quests } = (await res.json()) as { quests: QuestCatalogItem[] };

    if (json) {
        console.log(JSON.stringify(quests, null, 2));
        return;
    }

    // Sort by earned desc, then title — most-completed quests first.
    const rows = [...quests].sort(
        (a, b) =>
            b.stats.earned - a.stats.earned || a.title.localeCompare(b.title),
    );

    const headers = [
        "quest_id",
        "reward",
        "earned",
        "claimed",
        "unclaimed",
        "pollen_awarded",
        "pollen_claimed",
    ];
    const idW = Math.max(8, ...rows.map((r) => r.id.length));
    const widths = [idW, 7, 7, 7, 9, 14, 14];

    console.log(`Quest stats — ${base} (${rows.length} quests)\n`);
    console.log(headers.map((h, i) => pad(h, widths[i], i > 0)).join("  "));
    console.log(widths.map((w) => "-".repeat(w)).join("  "));

    const totals = {
        earned: 0,
        claimed: 0,
        unclaimed: 0,
        awarded: 0,
        claimedP: 0,
    };
    for (const r of rows) {
        const s = r.stats;
        totals.earned += s.earned;
        totals.claimed += s.claimed;
        totals.unclaimed += s.unclaimed;
        totals.awarded += s.pollenAwarded;
        totals.claimedP += s.pollenClaimed;
        console.log(
            [
                pad(r.id, widths[0]),
                pad(r.rewardAmount ?? "-", widths[1], true),
                pad(s.earned, widths[2], true),
                pad(s.claimed, widths[3], true),
                pad(s.unclaimed, widths[4], true),
                pad(s.pollenAwarded, widths[5], true),
                pad(s.pollenClaimed, widths[6], true),
            ].join("  "),
        );
    }

    console.log(widths.map((w) => "-".repeat(w)).join("  "));
    console.log(
        [
            pad("TOTAL", widths[0]),
            pad("", widths[1], true),
            pad(totals.earned, widths[2], true),
            pad(totals.claimed, widths[3], true),
            pad(totals.unclaimed, widths[4], true),
            pad(totals.awarded, widths[5], true),
            pad(totals.claimedP, widths[6], true),
        ].join("  "),
    );
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
