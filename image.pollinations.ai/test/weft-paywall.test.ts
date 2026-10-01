import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
        expect(response.text).toContain(
            "Create a Weft account and verify your email",
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
