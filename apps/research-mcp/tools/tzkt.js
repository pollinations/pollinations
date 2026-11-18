import { z } from "zod";
import { fetchJson } from "../fetch.js";

function num(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value) {
    return typeof value === "string" && value.length > 0 ? value : null;
}

export const tzktTools = [
    [
        "tzkt_blocks",
        "Latest Tezos blocks from the TzKT indexer: level, hash, timestamp, protocol, cycle, attestation power, proposer and fees, newest first. Tezos only — a niche chain, not Bitcoin or Ethereum; for those use blockchain_stats. The total is the number of blocks returned, not the chain height.",
        {
            limit: z
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "How many recent blocks to return, 1 to 10. Defaults to 5.",
                ),
        },
        async ({ limit = 5 } = {}) => {
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const data = await fetchJson(
                `https://api.tzkt.io/v1/blocks?limit=${n}&sort.desc=level`,
            );
            if (!Array.isArray(data))
                throw new Error("TzKT returned an unexpected response.");
            return {
                total: data.length,
                blocks: data.map((block) => ({
                    level: num(block?.level),
                    hash: str(block?.hash),
                    timestamp: str(block?.timestamp),
                    proto: num(block?.proto),
                    cycle: num(block?.cycle),
                    attestationPower: num(block?.attestationPower),
                    proposer: block?.proposer
                        ? {
                              alias: str(block.proposer.alias),
                              address: str(block.proposer.address),
                          }
                        : null,
                    fees: num(block?.fees),
                    validations: num(block?.validations),
                })),
            };
        },
    ],
];
