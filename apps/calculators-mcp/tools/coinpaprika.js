// Coin metadata from CoinPaprika — no key. Two sequential fetches:
// search, then the detail record for the top match.
import * as z from "zod";
import { readResponseText } from "../../../shared/response-bytes.ts";

const USER_AGENT = "calculators-mcp/0.1 (https://pollinations.ai)";

const query = z
    .string()
    .min(1)
    .max(100)
    .describe("Coin name or symbol, for example bitcoin or BTC");

async function coinpaprika(path) {
    const response = await fetch(`https://api.coinpaprika.com/v1/${path}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
        redirect: "follow",
    });
    try {
        if (!response.ok)
            throw new Error(`CoinPaprika answered HTTP ${response.status}`);
        return JSON.parse(
            await readResponseText(
                response,
                64 * 1024,
                () =>
                    new Error(
                        "CoinPaprika response exceeds 64 KiB; narrow the query.",
                    ),
            ),
        );
    } finally {
        await response.body?.cancel();
    }
}

const cap = (text, limit) =>
    text.length > limit ? `${text.slice(0, limit)}…` : text;

export const coinpaprikaTools = [
    [
        "crypto_coin",
        "Coin metadata from CoinPaprika: rank, type, description, links and team for a coin by name or symbol — for example bitcoin or BTC. This is metadata only; it returns no price (see crypto_price for that). The search takes the top match, so a vague name can return a different coin than the one meant.",
        {
            query,
        },
        async ({ query: rawQuery }) => {
            // Zod only validates via the MCP server, so check again here for
            // direct handler calls, with a plain message rather than a zod dump.
            const parsed = query.safeParse(rawQuery?.trim());
            if (!parsed.success)
                throw new Error("query must be a non-empty string.");
            const term = parsed.data;
            const found = await coinpaprika(
                `search?q=${encodeURIComponent(term)}`,
            );
            const match = found.currencies?.[0];
            if (!match)
                throw new Error(`No CoinPaprika coin found for "${term}".`);
            const coin = await coinpaprika(`coins/${match.id}`);
            const links = coin.links ?? {};
            return {
                id: coin.id,
                name: coin.name,
                symbol: coin.symbol,
                rank: coin.rank,
                type: coin.type,
                description:
                    typeof coin.description === "string" &&
                    coin.description.length > 0
                        ? cap(coin.description, 500)
                        : null,
                links: {
                    website: Array.isArray(links.website)
                        ? links.website.slice(0, 1)
                        : [],
                    explorer: Array.isArray(links.explorer)
                        ? links.explorer.slice(0, 3)
                        : [],
                    source_code: Array.isArray(links.source_code)
                        ? links.source_code.slice(0, 1)
                        : [],
                },
                team: Array.isArray(coin.team)
                    ? coin.team.slice(0, 5).map((member) => ({
                          name: member.name,
                          position: member.position,
                      }))
                    : [],
            };
        },
    ],
];
