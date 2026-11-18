// Spot price for gold and silver from gold-api.com — no key.
// One fetch, one tiny object.
import * as z from "zod";
import { readResponseText } from "../../../shared/response-bytes.ts";

const USER_AGENT = "calculators-mcp/0.1 (https://pollinations.ai)";

const symbol = z
    .enum(["XAU", "XAG"])
    .describe("Metal to price: XAU for gold, XAG for silver");

async function goldApi(symbolCode) {
    const response = await fetch(
        `https://api.gold-api.com/price/${symbolCode}`,
        {
            headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
            signal: AbortSignal.timeout(10000),
            redirect: "follow",
        },
    );
    try {
        if (!response.ok)
            throw new Error(`gold-api.com answered HTTP ${response.status}`);
        return JSON.parse(
            await readResponseText(
                response,
                64 * 1024,
                () =>
                    new Error(
                        "gold-api.com response exceeds 64 KiB; try again later.",
                    ),
            ),
        );
    } finally {
        await response.body?.cancel();
    }
}

export const goldpriceTools = [
    [
        "gold_price",
        "Spot price for gold (XAU) or silver (XAG) in US dollars, from gold-api.com. One fetch, no key. This is a tiny free service with no stated reliability, so a price can be stale or the call can fail — the tool reports what the service returns and errors plainly when it does not answer.",
        {
            symbol: symbol.default("XAU"),
        },
        async ({ symbol: rawSymbol }) => {
            // Zod only validates via the MCP server, so check again here for
            // direct handler calls, with a plain message rather than a zod dump.
            const parsed = symbol.safeParse(rawSymbol);
            if (!parsed.success)
                throw new Error("symbol must be XAU (gold) or XAG (silver).");
            const code = parsed.data;
            const found = await goldApi(code);
            if (typeof found?.price !== "number")
                throw new Error(`No gold-api.com price found for "${code}".`);
            return {
                symbol: found.symbol ?? code,
                name: found.name ?? null,
                price: found.price,
                currency: found.currency ?? "USD",
                updatedAt: found.updatedAt ?? null,
            };
        },
    ],
];
