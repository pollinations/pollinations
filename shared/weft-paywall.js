import { readFileSync } from "node:fs";

// Inline the packaged art so the 402 page needs no external or paid asset request.
const illustration = readFileSync(
    new URL("./assets/weft-paywall.webp", import.meta.url),
).toString("base64");

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

/** Create the default browser paywall with route-specific wording and SDK asset lookup. */
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
            :root { color-scheme: light; --ink: #182734; --muted: #506577; --line: #dce6ee; --pollen: #ffe36b; }
            * { box-sizing: border-box; }
            body { margin: 0; color: var(--ink); background: #eef5fa; font-family: system-ui, -apple-system, sans-serif; line-height: 1.5; }
            main { width: min(720px, calc(100% - 32px)); margin: 32px auto; padding: 28px; background: #fff; border: 1px solid var(--line); border-radius: 24px; box-shadow: 0 16px 48px #2847600d; }
            .brand { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
            .wordmark { font-size: 21px; font-weight: 800; letter-spacing: -0.8px; }
            .payment-label { color: var(--muted); font-size: 12px; font-weight: 600; }
            .hero { text-align: center; margin: 24px 0; }
            .art { display: block; width: 100%; max-width: 380px; height: auto; margin: 0 auto 22px; border-radius: 16px; }
            h1 { max-width: 560px; margin: 0 auto 14px; font-size: clamp(30px, 4vw, 40px); font-weight: 800; line-height: 1.12; letter-spacing: -1.2px; text-wrap: balance; overflow-wrap: anywhere; }
            .intro { max-width: 460px; margin: 0 auto; color: var(--muted); font-size: 16px; }
            .setup { padding: 24px; background: #f8fbfd; border: 1px solid var(--line); border-radius: 16px; }
            .steps { padding: 0; margin: 0; list-style: none; }
            .steps li + li { margin-top: 22px; padding-top: 22px; border-top: 1px solid var(--line); }
            h2 { display: flex; align-items: center; gap: 10px; margin: 0 0 10px; font-size: 17px; font-weight: 700; }
            .step-number { display: grid; place-items: center; flex: 0 0 28px; height: 28px; border-radius: 8px; background: var(--pollen); font-size: 13px; }
            .instruction { margin: 0 0 10px; color: var(--muted); font-size: 14px; }
            code { display: block; padding: 13px 14px; background: #fff; border: 1px solid var(--line); border-radius: 8px; color: var(--ink); font: 13px/1.6 ui-monospace, SFMono-Regular, Consolas, monospace; overflow-wrap: anywhere; user-select: all; }
            .credit { margin: 12px 0 0; color: var(--muted); font-size: 14px; }
            .credit strong { color: var(--ink); }
            .setup-link { display: block; margin-top: 22px; padding: 13px 18px; border: 1px solid #e6c448; border-radius: 10px; background: var(--pollen); color: var(--ink); text-align: center; text-decoration: none; font-size: 15px; font-weight: 750; }
            .setup-link:hover { background: #ffdc44; }
            a:focus-visible { outline: 3px solid #24567e; outline-offset: 4px; }
            .connected { max-width: 460px; margin: 20px auto 0; color: var(--muted); text-align: center; font-size: 13px; }
            @media (max-width: 480px) {
                main { margin: 16px auto; padding: 20px; border-radius: 18px; }
                .wordmark { font-size: 19px; }
                .payment-label { font-size: 11px; }
                .hero { margin: 20px 0; }
                .art { max-width: 300px; margin-bottom: 18px; }
                .intro { font-size: 15px; }
                .setup { padding: 18px; }
            }
        </style>
    </head>
    <body>
        <main>
            <header class="brand">
                <span class="wordmark">pollinations</span>
                <span class="payment-label">Pay with Weft</span>
            </header>
            <section class="hero" aria-labelledby="paywall-heading">
                <img class="art" src="data:image/webp;base64,${illustration}" width="960" height="540" alt="The Pollinations bee and Weft mascot exchange a flower coin and a picture.">
                <h1 id="paywall-heading">${heading}</h1>
                <p class="intro">Give your AI agent a wallet. Let it pay for the ${item} and get back to work.</p>
            </section>
            <section class="setup" aria-label="Set up Weft">
                <ol class="steps" role="list">
                    <li>
                        <h2><span class="step-number" aria-hidden="true">1</span>Connect your agent</h2>
                        <p class="instruction">Paste this into your agent:</p>
                        <code>set up https://weft.network/setup.md</code>
                        <p class="credit">Create your Weft account and verify your email to get <strong>$3 in free credit</strong>.</p>
                    </li>
                    <li>
                        <h2><span class="step-number" aria-hidden="true">2</span>Ask it to pay</h2>
                        <code>Pay for this ${item} with Weft.</code>
                    </li>
                </ol>
                <a class="setup-link" href="https://weft.network/setup.md">Give my agent a wallet &rarr;</a>
            </section>
            <p class="connected">Already connected? Ask your agent to pay for this request.</p>
        </main>
    </body>
</html>`;
        },
    };
}
