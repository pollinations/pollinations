import { runInNewContext } from "node:vm";
import { evmPaywall } from "@x402/paywall/evm";
import { describe, expect, it } from "vitest";
import {
    createWeftPaywall,
    serveWeftWalletScript,
    WEFT_WALLET_SCRIPT_PATH,
} from "../weft-paywall.js";

const usdc = () => ({ decimals: 6, symbol: "USDC" });
const quote = {
    x402Version: 2,
    accepts: [
        {
            scheme: "exact",
            amount: "10000",
            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            network: "eip155:8453",
            payTo: "0x0000000000000000000000000000000000000001",
        },
    ],
};

function walletConfig(html: string) {
    const script = html.match(
        /<script>\s*(window\.x402 = [\s\S]*?)<\/script>/,
    )?.[1];
    if (!script) throw new Error("Missing wallet configuration");
    const window: { location: { href: string }; x402?: unknown } = {
        location: { href: "" },
    };
    runInNewContext(script, { window, console: { log() {} } });
    return window.x402;
}

function serve(method: string, url: string | null) {
    const res = { status: 0, headers: {}, body: undefined as unknown };
    const handled = serveWeftWalletScript(
        { method, url } as never,
        {
            writeHead(status: number, headers: object) {
                res.status = status;
                res.headers = headers;
            },
            end(body?: unknown) {
                res.body = body;
            },
        } as never,
    );
    return { handled, ...res };
}

describe("Weft wallet checkout", () => {
    // Fails on an SDK bump that changes the window.x402 contract.
    it("writes the same wallet config the pinned SDK writes", () => {
        const sdk = walletConfig(
            evmPaywall.generateHtml(quote.accepts[0], quote, {
                appName: "Pollinations",
                testnet: false,
            }),
        );
        const ours = walletConfig(
            createWeftPaywall("image", usdc).generateHtml(quote),
        );
        expect(ours).toEqual(JSON.parse(JSON.stringify(sdk)));
    });

    it("keeps the wallet bundle out of the 402 page", () => {
        const html = createWeftPaywall("image", usdc).generateHtml(quote);
        expect(WEFT_WALLET_SCRIPT_PATH).toMatch(
            /^\/weft-paywall\/[0-9a-f]{16}\.js$/,
        );
        expect(html).toContain(
            `<script type="module" src="${WEFT_WALLET_SCRIPT_PATH}"></script>`,
        );
        expect(html.length).toBeLessThan(100_000);
    });

    it("serves the wallet bundle as an immutable script", () => {
        const get = serve("GET", WEFT_WALLET_SCRIPT_PATH);
        expect(get.handled).toBe(true);
        expect(get.status).toBe(200);
        expect(get.headers).toMatchObject({
            "Content-Type": "text/javascript; charset=utf-8",
            "Cache-Control": "public, max-age=31536000, immutable",
        });
        const body = String(get.body);
        expect(body.length).toBeGreaterThan(1_000_000);
        expect(body).not.toMatch(/^\s*</);
        expect(body).not.toContain("</body>");

        const head = serve("HEAD", WEFT_WALLET_SCRIPT_PATH);
        expect(head.status).toBe(200);
        expect(head.body).toBeUndefined();
        expect(serve("POST", WEFT_WALLET_SCRIPT_PATH).handled).toBe(false);
        expect(serve("GET", "/weft-paywall/other.js").handled).toBe(false);
        expect(serve("GET", `${WEFT_WALLET_SCRIPT_PATH}?x=1`).handled).toBe(
            false,
        );
    });
});
