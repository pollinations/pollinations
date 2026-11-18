// Latest stock quote for a ticker symbol, from Yahoo Finance's public
// chart endpoint — no key. One fetch, ~1.3 KB payload. The endpoint is
// unofficial: Yahoo can rate-limit a shared service or change it without
// notice, and unknown symbols answer 404.
import * as z from "zod";
import { readResponseText } from "../../../shared/response-bytes.ts";

const USER_AGENT = "calculators-mcp/0.1 (https://pollinations.ai)";

// Ticker symbols: letters, digits, dots, carets and dashes, for example
// AAPL, BRK.B, ^GSPC. Normalised to upper case before the fetch.
const symbol = z
    .string()
    .min(1)
    .max(12)
    .describe("Ticker symbol, for example AAPL — upper-cased automatically");

async function yahooQuote(ticker) {
    const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`,
        {
            headers: {
                "User-Agent": USER_AGENT,
                Accept: "application/json",
            },
            signal: AbortSignal.timeout(10000),
            redirect: "follow",
        },
    );
    const body = JSON.parse(
        await readResponseText(
            response,
            512 * 1024,
            () => new Error("Yahoo Finance response exceeds 512 KiB."),
        ),
    );
    // An unknown symbol answers HTTP 404 with an error object, not an empty
    // result, so surface its description as a named error.
    if (body.chart?.error) {
        const description = body.chart.error.description ?? "unknown symbol";
        throw new Error(
            `No Yahoo Finance quote for ${ticker}: ${String(description).trim()}`,
        );
    }
    if (!response.ok)
        throw new Error(
            `Yahoo Finance answered HTTP ${response.status}${response.status === 429 ? "; rate limited, retry later" : ""}.`,
        );
    const meta = body.chart?.result?.[0]?.meta;
    if (!meta || typeof meta.regularMarketPrice !== "number")
        throw new Error("Yahoo Finance did not return a quote.");
    return meta;
}

export const yahooTools = [
    [
        "stock_quote",
        "Latest stock quote for a ticker symbol: price, day change, day and 52-week range, volume, currency and exchange. From Yahoo Finance's public chart endpoint, no key — it is unofficial, so Yahoo can rate-limit a shared service or change it without notice.",
        {
            symbol,
        },
        async ({ symbol: raw }) => {
            // Zod only validates via the MCP server, so check again here for
            // direct handler calls, with a plain message rather than a zod dump.
            const trimmed = raw.trim().toUpperCase();
            if (!/^[A-Z0-9.^=-]{1,12}$/.test(trimmed))
                throw new Error(
                    "symbol must be 1–12 characters: letters, digits, dots, carets or dashes, for example AAPL.",
                );
            const meta = await yahooQuote(trimmed);
            return {
                symbol: meta.symbol,
                name: meta.longName ?? meta.shortName ?? null,
                price: meta.regularMarketPrice,
                change_percent: meta.regularMarketChangePercent ?? null,
                day_high: meta.regularMarketDayHigh ?? null,
                day_low: meta.regularMarketDayLow ?? null,
                fifty_two_week_high: meta.fiftyTwoWeekHigh ?? null,
                fifty_two_week_low: meta.fiftyTwoWeekLow ?? null,
                volume: meta.regularMarketVolume ?? null,
                currency: meta.currency ?? null,
                exchange: meta.exchangeName ?? null,
            };
        },
    ],
];
