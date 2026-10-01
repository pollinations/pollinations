// Render the x402 response amount using the SDK's asset metadata, not the route price.
function quotedPrice(paymentRequired, findAsset) {
    const payment = paymentRequired.accepts[0];
    if (
        !payment ||
        typeof payment.amount !== "string" ||
        !/^\d+$/.test(payment.amount) ||
        typeof payment.asset !== "string" ||
        typeof payment.network !== "string"
    )
        return null;
    const asset = findAsset(payment.asset, payment.network);
    if (!asset) return null;

    const amount = BigInt(payment.amount);
    const scale = 10n ** BigInt(asset.decimals);
    const fraction = (amount % scale)
        .toString()
        .padStart(asset.decimals, "0")
        .replace(/0+$/, "")
        .padEnd(2, "0");
    const currency = asset.symbol === "USDC" ? "USD" : asset.symbol;
    return `${amount / scale}.${fraction} ${currency}`;
}

// One default browser page, with image/text wording selected by the owning route.
export function createWeftPaywall(resourceType, findAsset) {
    const item = resourceType === "image" ? "image" : "response";
    return {
        generateHtml(paymentRequired) {
            const price = quotedPrice(paymentRequired, findAsset);
            const heading = price
                ? `Get your ${item} for just ${price}`
                : `Get your ${item} with Weft`;
            return `<!DOCTYPE html>
<html lang="en">
    <head>
        <title>Payment Required - Pollinations</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { margin: 0; color: #171717; background: #fff; font-family: system-ui, -apple-system, sans-serif; }
            main { max-width: 600px; margin: 50px auto; padding: 20px; }
            .setup { margin-top: 2rem; padding: 1rem; background: #fef3c7; border-radius: 0.5rem; }
            code { display: block; padding: 1rem; background: #fff; border-radius: 0.25rem; overflow-wrap: anywhere; }
            a { color: #1d4ed8; }
        </style>
    </head>
    <body>
        <main>
            <h1>${heading}</h1>
            <p>Give your AI agent a wallet. Let it pay for the ${item} and get back to work.</p>
            <section class="setup" aria-label="Set up Weft">
                <p><strong>Paste this into your agent:</strong></p>
                <code>set up https://weft.network/setup.md</code>
                <p>Create your Weft account and verify your email to get <strong>$3 in free credit</strong>.</p>
                <p>Then tell your agent:</p>
                <code>Pay for this ${item} with Weft.</code>
                <p><a href="https://weft.network/setup.md">Give my agent a wallet &rarr;</a></p>
            </section>
            <p>Already connected? Ask your agent to pay for this request.</p>
        </main>
    </body>
</html>`;
        },
    };
}
