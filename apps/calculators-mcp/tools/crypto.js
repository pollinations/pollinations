import * as z from "zod";
import { readResponseText } from "../../../shared/response-bytes.ts";

const USER_AGENT = "crypto-mcp/0.1 (https://pollinations.ai)";

// Coinbase lists bitcoin under BTC, but some callers use its ISO 4217 code.
const SYMBOL_ALIASES = { XBT: "BTC" };

const symbol = z
    .string()
    .regex(/^[A-Za-z0-9]{2,10}$/)
    .describe(
        "Crypto symbol, e.g. BTC, ETH, SOL. XBT is accepted for bitcoin.",
    );

const fiat = z
    .string()
    .regex(/^[A-Za-z]{3}$/)
    .describe("Fiat currency code, e.g. USD, EUR, GBP.");

// Round to 10 significant digits, the same convention as unit_convert and
// loan_payment: exact values stay exact and repeating decimals stay short.
function round10(value) {
    return Number(value.toPrecision(10));
}

// Coinbase answers 404 for an unknown product, which is bad input, so
// return null; anything else unexpected is an upstream error.
async function coinbaseTicker(product) {
    const response = await fetch(
        `https://api.exchange.coinbase.com/products/${product}/ticker`,
        {
            headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
            signal: AbortSignal.timeout(10000),
            redirect: "follow",
        },
    );
    try {
        if (response.status === 404) return null;
        if (!response.ok)
            throw new Error(`Coinbase answered HTTP ${response.status}`);
        return JSON.parse(
            await readResponseText(
                response,
                512 * 1024,
                () => new Error("Crypto price response exceeds 512 KiB."),
            ),
        );
    } finally {
        await response.body?.cancel();
    }
}

const failure = (message) => {
    throw new Error(message);
};

export const cryptoTools = [
    [
        "crypto_price",
        "Spot price for a cryptocurrency in a fiat currency, from Coinbase Exchange (no key). Returns the last trade price, best bid and ask with their spread, 24h volume in the crypto, and the time of the last trade. The currency family (currency_convert/list/rates) covers fiat only, so this is the crypto side of it.",
        {
            symbol,
            currency: fiat.default("USD"),
        },
        async ({ symbol: rawSymbol, currency: rawCurrency }) => {
            const base =
                SYMBOL_ALIASES[rawSymbol.toUpperCase()] ??
                rawSymbol.toUpperCase();
            const currency = rawCurrency.toUpperCase();
            const ticker = await coinbaseTicker(`${base}-${currency}`);
            if (!ticker)
                return failure(
                    `No Coinbase market for ${base}-${currency}: unknown symbol or unsupported currency.`,
                );
            const price = Number(ticker.price);
            const bid = Number(ticker.bid);
            const ask = Number(ticker.ask);
            const volume = Number(ticker.volume);
            if (
                ![price, bid, ask, volume].every(Number.isFinite) ||
                typeof ticker.time !== "string"
            )
                throw new Error(
                    "Coinbase answered with an unexpected ticker shape.",
                );
            const spread = ask - bid;
            return {
                symbol: base,
                currency,
                pair: `${base}-${currency}`,
                price: round10(price),
                bid: round10(bid),
                ask: round10(ask),
                spread: round10(spread),
                spread_percent: round10((spread / ((ask + bid) / 2)) * 100),
                volume_24h: round10(volume),
                time: ticker.time,
            };
        },
    ],
];
