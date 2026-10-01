import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { findDefaultAsset, getDefaultAsset } from "@x402/evm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createWeftPaywall } from "../../shared/weft-paywall.js";
import { requireImagePayment } from "../src/weftX402.ts";

const network = "eip155:84532";
const payTo = "0x0000000000000000000000000000000000000001";
const facilitatorRequests: string[] = [];
const facilitator = createServer((req, res) => {
    facilitatorRequests.push(req.url ?? "");
    if (req.url !== "/supported") {
        res.writeHead(500);
        res.end("Unexpected facilitator request");
        return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
        JSON.stringify({
            kinds: [{ x402Version: 2, scheme: "exact", network }],
            extensions: [],
            signers: {},
        }),
    );
});
const image = createServer((req, res) => {
    requireImagePayment(req, res, async () => {
        res.writeHead(200);
        res.end("Unexpected image generation");
    });
});

beforeAll(async () => {
    await new Promise<void>((resolve) =>
        facilitator.listen(0, "127.0.0.1", resolve),
    );
    const { port } = facilitator.address() as AddressInfo;
    vi.stubEnv("WEFT_SELLER_API_KEY", "test-seller-key");
    vi.stubEnv("WEFT_PAY_TO", payTo);
    vi.stubEnv("WEFT_NETWORK", network);
    vi.stubEnv("WEFT_FACILITATOR_URL", `http://127.0.0.1:${port}`);
});

afterAll(async () => {
    vi.unstubAllEnvs();
    await new Promise<void>((resolve, reject) => {
        facilitator.close((error) => (error ? reject(error) : resolve()));
    });
});

describe("Payment-response pricing", () => {
    const paywall = createWeftPaywall("image", findDefaultAsset);
    const asset = getDefaultAsset(network).asset;

    it.each([
        ["10000", "0.01"],
        ["125000", "0.125"],
        ["1", "0.000001"],
        ["1000000", "1.00"],
        ["9007199254740993", "9007199254.740993"],
    ])("displays the quoted amount %s as %s USD", (amount, expected) => {
        const html = paywall.generateHtml({
            accepts: [{ amount, asset, network }],
        });
        expect(html).toContain(`Get your image for just ${expected} USD`);
    });

    it("uses the token's declared decimals instead of assuming six", () => {
        const network = "eip155:4326";
        const asset = getDefaultAsset(network);
        expect(asset.decimals).toBe(18);
        const html = paywall.generateHtml({
            accepts: [
                {
                    amount: "10000000000000000",
                    asset: asset.asset,
                    network,
                },
            ],
        });
        expect(html).toContain(`Get your image for just 0.01 ${asset.symbol}`);
        expect(html).not.toContain("0.01 USD");
    });

    it.each([
        { accepts: [] },
        { accepts: [{ amount: "10000", asset: payTo, network }] },
        { accepts: [{ amount: "<script>alert(1)</script>", asset, network }] },
    ])("does not invent a price for an absent or invalid quote", ({
        accepts,
    }) => {
        const html = paywall.generateHtml({ accepts });
        expect(html).toContain("Get your image with Weft");
        expect(html).not.toContain(" USD");
        expect(html).not.toContain("<script");
    });
});

describe("Weft image paywall", () => {
    it("shows account setup and free credit to browsers without changing the challenge", async () => {
        const response = await request(image)
            .get("/prompt/hello")
            .set("Accept", "text/html")
            .set("User-Agent", "Mozilla/5.0");

        expect(response.status).toBe(402);
        expect(response.headers["content-type"]).toContain("text/html");
        expect(response.text).toContain("set up https://weft.network/setup.md");
        expect(response.text).toContain('href="https://weft.network/setup.md"');
        expect(response.text).toContain("Get your image for just 0.01 USD");
        expect(response.text).toContain("Give your AI agent a wallet");
        expect(response.text).toContain("Pay for this image with Weft.");
        expect(response.text).toContain(
            "Create your Weft account and verify your email",
        );
        expect(response.text).toContain("$3 in free credit");
        expect(response.text).not.toContain("Note to developers");
        expect(response.text).not.toContain("<script");
        expect(response.headers["cache-control"]).toContain("no-store");

        const challenge = JSON.parse(
            Buffer.from(
                response.headers["payment-required"],
                "base64",
            ).toString(),
        );
        expect(challenge.x402Version).toBe(2);
        expect(challenge.accepts).toEqual([
            expect.objectContaining({
                scheme: "exact",
                network,
                payTo,
                amount: "10000",
            }),
        ]);
    });

    it("keeps non-browser payment responses as JSON", async () => {
        const response = await request(image)
            .get("/prompt/hello")
            .set("Accept", "application/json")
            .set("User-Agent", "Mozilla/5.0");

        expect(response.status).toBe(402);
        expect(response.headers["content-type"]).toContain("application/json");
        expect(response.body).toEqual({});
        expect(response.headers["payment-required"]).toBeTruthy();
        expect(response.text).not.toContain("weft.network/setup.md");
        expect(facilitatorRequests.every((url) => url === "/supported")).toBe(
            true,
        );
    });
});
