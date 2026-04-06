#!/usr/bin/env npx tsx

import {
    escapeSqlString,
    formatSemicolonList,
    LEDGER_PATH,
    loadLedger,
    nowIso,
    parseTimestampSeconds,
    parseTinybirdDateTime,
    queryTinybirdSql,
    requireRunId,
    saveLedger,
} from "../shared/abuse-ledger.ts";

type IpRow = {
    user_id: string;
    ip_hash: string;
    ip_subnet: string;
    first_seen_at: string;
};

function getStringFlag(flag: string, fallback = ""): string {
    const args = process.argv.slice(2);
    const index = args.indexOf(flag);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function getNumberFlag(flag: string, fallback: number): number {
    const raw = getStringFlag(flag);
    return raw ? Number.parseInt(raw, 10) : fallback;
}

async function main(): Promise<void> {
    const cohort = getStringFlag("--cohort");
    const explicitRunId = getStringFlag("--run-id");
    const ledgerPath = getStringFlag("--ledger", LEDGER_PATH);
    const batchSize = getNumberFlag("--batch-size", 50);

    const ledgerRows = loadLedger(ledgerPath);
    const runId = requireRunId(ledgerRows, explicitRunId, cohort);
    const currentRows = ledgerRows.filter(
        (row) =>
            row.run_id === runId &&
            (!cohort || row.cohort === cohort) &&
            row.id &&
            row.created_at_ts,
    );

    if (currentRows.length === 0) {
        console.log("⚠️  No users found for the selected run.");
        return;
    }

    console.log("🌐 Abuse Enrich IP");
    console.log("=".repeat(50));
    console.log(`🏷️  Run ID: ${runId}`);
    console.log(`📊 Users: ${currentRows.length}`);

    const createdAtById = new Map<string, number>();
    for (const row of currentRows) {
        const createdAt = parseTimestampSeconds(row.created_at_ts);
        if (createdAt !== null) createdAtById.set(row.id, createdAt);
    }

    const ipHashesByUser = new Map<string, Set<string>>();
    const subnetsByUser = new Map<string, Set<string>>();

    for (let index = 0; index < currentRows.length; index += batchSize) {
        const batch = currentRows.slice(index, index + batchSize);
        const ids = batch
            .map((row) => `'${escapeSqlString(row.id)}'`)
            .join(",");
        const createdAts = batch
            .map((row) => parseTimestampSeconds(row.created_at_ts))
            .filter((value): value is number => value !== null);

        if (createdAts.length === 0) continue;

        const earliestCreatedAt = Math.min(...createdAts);
        const latestWindowEnd = Math.max(...createdAts) + 72 * 3600;
        const sql = `SELECT
            user_id,
            ip_hash,
            ip_subnet,
            min(start_time) as first_seen_at
        FROM generation_event
        WHERE user_id IN (${ids})
          AND environment = 'production'
          AND (ip_hash != 'undefined' OR ip_subnet != 'undefined')
          AND start_time >= toDateTime(${earliestCreatedAt})
          AND start_time < toDateTime(${latestWindowEnd})
        GROUP BY user_id, ip_hash, ip_subnet
        FORMAT JSON`;

        const rows = await queryTinybirdSql<IpRow>(sql);
        for (const row of rows) {
            const createdAt = createdAtById.get(row.user_id);
            const firstSeenAt = parseTinybirdDateTime(row.first_seen_at);
            if (createdAt === undefined || firstSeenAt === null) continue;
            if (
                firstSeenAt < createdAt ||
                firstSeenAt >= createdAt + 72 * 3600
            ) {
                continue;
            }

            if (row.ip_hash && row.ip_hash !== "undefined") {
                const ipHashes =
                    ipHashesByUser.get(row.user_id) ?? new Set<string>();
                ipHashes.add(row.ip_hash);
                ipHashesByUser.set(row.user_id, ipHashes);
            }

            if (row.ip_subnet && row.ip_subnet !== "undefined") {
                const subnets =
                    subnetsByUser.get(row.user_id) ?? new Set<string>();
                subnets.add(row.ip_subnet);
                subnetsByUser.set(row.user_id, subnets);
            }
        }
    }

    const usersByIpHash = new Map<string, Set<string>>();
    const usersBySubnet = new Map<string, Set<string>>();

    for (const [userId, ipHashes] of ipHashesByUser.entries()) {
        for (const ipHash of ipHashes) {
            const users = usersByIpHash.get(ipHash) ?? new Set<string>();
            users.add(userId);
            usersByIpHash.set(ipHash, users);
        }
    }

    for (const [userId, subnets] of subnetsByUser.entries()) {
        for (const subnet of subnets) {
            const users = usersBySubnet.get(subnet) ?? new Set<string>();
            users.add(userId);
            usersBySubnet.set(subnet, users);
        }
    }

    const checkedAt = nowIso();
    for (const row of currentRows) {
        const ipPeers = new Set<string>();
        const subnetPeers = new Set<string>();

        for (const ipHash of ipHashesByUser.get(row.id) ?? []) {
            for (const peerId of usersByIpHash.get(ipHash) ?? []) {
                if (peerId !== row.id) ipPeers.add(peerId);
            }
        }

        for (const subnet of subnetsByUser.get(row.id) ?? []) {
            for (const peerId of usersBySubnet.get(subnet) ?? []) {
                if (peerId !== row.id) subnetPeers.add(peerId);
            }
        }

        row.ip_checked_at = checkedAt;
        row.ip_hash_peer_ids_in_run = formatSemicolonList(ipPeers);
        row.subnet_peer_ids_in_run = formatSemicolonList(subnetPeers);
    }

    saveLedger(ledgerRows, ledgerPath);

    console.log(`✅ Checked: ${currentRows.length}`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
