import { z } from "zod";
import { fetchJson } from "../fetch.js";

const CHAINS = [
    "bitcoin",
    "ethereum",
    "litecoin",
    "dogecoin",
    "bitcoin-cash",
    "zcash",
];

function num(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export const blockchairTools = [
    [
        "blockchain_stats",
        "Live network statistics for a public blockchain from Blockchair: block count, total transactions, mining difficulty, hashrate, mempool size and throughput, and the latest block. Network stats only — it does not return prices; the crypto price lookup stays the tool for market prices.",
        {
            chain: z
                .enum(CHAINS)
                .default("bitcoin")
                .describe(
                    "Blockchain to query: bitcoin, ethereum, litecoin, dogecoin, bitcoin-cash or zcash. Defaults to bitcoin.",
                ),
        },
        async ({ chain = "bitcoin" }) => {
            const slug =
                typeof chain === "string" ? chain.trim().toLowerCase() : chain;
            if (!CHAINS.includes(slug))
                throw new Error(
                    `Unknown chain "${chain}". Use one of: ${CHAINS.join(", ")}.`,
                );
            const data = await fetchJson(
                `https://api.blockchair.com/${slug}/stats`,
            );
            const stats = data?.data;
            if (!stats || typeof stats !== "object")
                throw new Error(`Blockchair returned no stats for ${slug}.`);
            return {
                chain: slug,
                blocks: num(stats.blocks),
                transactions: num(stats.transactions),
                difficulty: num(stats.difficulty),
                hashrate24h:
                    typeof stats.hashrate_24h === "string"
                        ? stats.hashrate_24h
                        : null,
                mempoolTransactions: num(stats.mempool_transactions),
                mempoolSizeBytes: num(stats.mempool_size),
                mempoolTps: num(stats.mempool_tps),
                bestBlockHeight: num(stats.best_block_height),
                bestBlockHash: stats.best_block_hash ?? null,
                bestBlockTime: stats.best_block_time ?? null,
            };
        },
    ],
];
