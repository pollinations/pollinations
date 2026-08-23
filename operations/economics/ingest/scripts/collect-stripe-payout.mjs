import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const [payoutId, outputArgument] = process.argv.slice(2);
if (!payoutId || !outputArgument || !/^po_[A-Za-z0-9]+$/.test(payoutId)) {
    throw new Error(
        "Usage: node collect-stripe-payout.mjs <po_id> <output.json>",
    );
}

const apiKey = process.env.STRIPE_API_KEY;
if (!apiKey) throw new Error("STRIPE_API_KEY is missing");

const authorization = `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;

async function stripeJson(url) {
    const response = await fetch(url, {
        headers: { Authorization: authorization },
    });
    if (!response.ok) {
        throw new Error(`Stripe request failed: HTTP ${response.status}`);
    }
    return response.json();
}

const payout = await stripeJson(
    `https://api.stripe.com/v1/payouts/${payoutId}`,
);
const balanceTransactions = [];
let startingAfter = "";
let pageCount = 0;

while (true) {
    const url = new URL("https://api.stripe.com/v1/balance_transactions");
    url.searchParams.set("payout", payoutId);
    url.searchParams.set("limit", "100");
    if (startingAfter) url.searchParams.set("starting_after", startingAfter);

    const page = await stripeJson(url);
    pageCount += 1;
    balanceTransactions.push(...page.data);

    if (!page.has_more) break;
    const lastId = page.data.at(-1)?.id;
    if (!lastId || pageCount >= 100) {
        throw new Error("Stripe payout pagination did not terminate safely");
    }
    startingAfter = lastId;
}

const containedNet = balanceTransactions
    .filter((row) => row.type !== "payout")
    .reduce((sum, row) => sum + row.net, 0);
if (containedNet !== payout.amount) {
    throw new Error(
        `Stripe payout does not reconcile: expected ${payout.amount}, received ${containedNet}`,
    );
}

const outputPath = resolve(outputArgument);
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
    outputPath,
    `${JSON.stringify(
        {
            collected_at: new Date().toISOString(),
            payout,
            page_count: pageCount,
            balance_transactions: balanceTransactions,
            reconciliation: {
                payout_amount: payout.amount,
                contained_net: containedNet,
                currency: payout.currency,
            },
        },
        null,
        2,
    )}\n`,
);

console.log(
    JSON.stringify({
        output: outputPath,
        pages: pageCount,
        rows: balanceTransactions.length,
        payout_amount: payout.amount,
        contained_net: containedNet,
        currency: payout.currency,
    }),
);
