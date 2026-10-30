import { expect, test } from "@playwright/test";
import {
    decodePaymentSignatureHeader,
    encodePaymentRequiredHeader,
} from "@x402/core/http";
import { verifyTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// An unfunded public fixture signs real EIP-712 data. Only wallet RPC and
// payment/balance HTTP responses are simulated; the application is unmodified.
const signer = privateKeyToAccount(`0x${"1".repeat(64)}`);
let signatures = 0;

test.beforeEach(async ({ page }) => {
    signatures = 0;
    await page.route("**/api/**", (route) =>
        route.fulfill(
            route.request().url().includes("/auth/get-session")
                ? { json: null }
                : { status: 204 },
        ),
    );
    await page.route("**/api/x402/keys/*", (route) => {
        const amount = Number(
            new URL(route.request().url()).pathname.split("/").pop(),
        );
        return route.fulfill({
            status: 402,
            headers: {
                "PAYMENT-REQUIRED": encodePaymentRequiredHeader({
                    x402Version: 2,
                    resource: {
                        url: route.request().url(),
                        description: "Prepaid Pollen",
                        mimeType: "application/json",
                    },
                    accepts: [
                        {
                            scheme: "exact",
                            network: "eip155:8453",
                            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                            amount: String(Math.round(amount * 1_000_000)),
                            payTo: "0x0000000000000000000000000000000000000002",
                            maxTimeoutSeconds: 60,
                            extra: { name: "USD Coin", version: "2" },
                        },
                    ],
                }),
            },
        });
    });
    await page.exposeFunction("signFixture", async (data) => {
        signatures++;
        const signature = await signer.signTypedData(data);
        expect(
            await verifyTypedData({
                ...data,
                address: signer.address,
                signature,
            }),
        ).toBe(true);
        return signature;
    });
    await page.addInitScript((address) => {
        const state = window as Window & {
            walletFailure?: number;
            walletFailureMethod?: string;
            signFixture: (data: unknown) => Promise<string>;
            ethereum?: {
                request: (args: {
                    method: string;
                    params?: string[];
                }) => Promise<unknown>;
            };
        };
        state.ethereum = {
            request: async ({ method, params }) => {
                if (
                    state.walletFailure &&
                    method ===
                        (state.walletFailureMethod ?? "eth_requestAccounts")
                )
                    throw Object.assign(new Error("Fixture wallet error"), {
                        code: state.walletFailure,
                    });
                switch (method) {
                    case "eth_requestAccounts":
                    case "eth_accounts":
                        return [address];
                    case "eth_chainId":
                        return "0x2105";
                    case "wallet_switchEthereumChain":
                        return null;
                    case "eth_signTypedData_v4":
                        return state.signFixture(
                            JSON.parse(params?.[1] ?? "{}"),
                        );
                    default:
                        throw new Error(`Unexpected wallet RPC: ${method}`);
                }
            },
        };
    }, signer.address);
    await page.goto("/pollen");
    await expect(
        page.getByRole("heading", { name: "Buy prepaid Pollen" }),
    ).toBeVisible();
});

test("session failures do not block guest checkout or lose its key on recovery", async ({
    page,
}) => {
    await page.route("**/api/auth/get-session", (route) =>
        route.fulfill({ status: 503 }),
    );
    await page.reload();
    await expect(
        page.getByRole("heading", { name: "Buy prepaid Pollen" }),
    ).toBeVisible();
    await page
        .getByRole("button", { name: "Review payment", exact: true })
        .click();
    await expect(
        page.getByText("Pay 2.00 USDC on Base for 2 Pollen."),
    ).toBeVisible();
    await page.route("**/api/x402/keys/*", (route) =>
        route.request().headers()["payment-signature"]
            ? route.fulfill({ json: { key: "sk_browser_fixture", pollen: 2 } })
            : route.fallback(),
    );
    await page
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
    await page
        .getByRole("button", { name: "Pay 2.00 USDC", exact: true })
        .click();
    await expect(
        page.getByRole("button", { name: "Copy prepaid API key" }),
    ).toBeVisible();
    await page.route("http://localhost:8788/**", (route) =>
        route.fulfill({ status: 401 }),
    );
    await page.route("**/api/auth/get-session", (route) =>
        route.fulfill({
            json: {
                session: {
                    id: "fixture-session",
                    userId: "fixture-buyer",
                    expiresAt: new Date(Date.now() + 60_000).toISOString(),
                },
                user: {
                    id: "fixture-buyer",
                    name: "Fixture buyer",
                    email: "fixture@example.com",
                },
            },
        }),
    );
    const recovered = page.waitForResponse(
        (response) =>
            response.url().includes("/auth/get-session") &&
            response.status() === 200,
    );
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await recovered;
    await expect(
        page.getByText("Temporary outage", { exact: true }),
    ).toHaveCount(0);
    await expect(
        page.getByRole("button", { name: "Copy prepaid API key" }),
    ).toBeVisible();
});

test("double-clicks sign once, uncertain retries reuse the proof, and the key checks its balance", async ({
    page,
    context,
}) => {
    const paidHeaders: string[] = [];
    let releasePayment: () => void = () => {};
    const paymentGate = new Promise<void>((resolve) => {
        releasePayment = resolve;
    });
    await page.route("**/api/x402/keys/*", async (route) => {
        const signature = route.request().headers()["payment-signature"];
        if (!signature) return route.fallback();
        paidHeaders.push(signature);
        const payload = decodePaymentSignatureHeader(signature);
        expect(payload.accepted).toMatchObject({
            network: "eip155:8453",
            amount: "2000000",
        });
        if (paidHeaders.length === 1) {
            await paymentGate;
            return route.fulfill({ status: 503 });
        }
        return route.fulfill({
            json: { key: "sk_browser_fixture", pollen: 2 },
        });
    });
    await page.route("**/account/balance", async (route) => {
        expect(route.request().headers().authorization).toBe(
            "Bearer sk_browser_fixture",
        );
        await route.fulfill({
            json: { balance: 2 },
            headers: { "Access-Control-Allow-Origin": "*" },
        });
    });
    await page
        .getByRole("button", { name: "Review payment", exact: true })
        .click();
    await page
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
    await expect(
        page.getByText(`Connected wallet: ${signer.address} · Base`),
    ).toBeVisible();
    const firstPaid = page.waitForRequest((request) =>
        Boolean(request.headers()["payment-signature"]),
    );
    // Two submissions in one event loop turn exercise the synchronous lock.
    await page
        .getByRole("button", { name: "Pay 2.00 USDC", exact: true })
        .evaluate((button) => {
            (button as HTMLButtonElement).click();
            (button as HTMLButtonElement).click();
        });
    await firstPaid;
    expect(signatures).toBe(1);
    await expect.poll(() => paidHeaders.length).toBe(1);
    releasePayment();
    await expect(
        page.getByText("Payment is not confirmed.", { exact: false }),
    ).toBeVisible();
    const pendingWarning = page.waitForEvent("dialog");
    const pendingLeave = page
        .getByRole("link", { name: "Terms", exact: true })
        .click();
    const pendingDialog = await pendingWarning;
    expect(pendingDialog.type()).toBe("beforeunload");
    await pendingDialog.dismiss();
    await pendingLeave;
    await page
        .getByRole("button", { name: "Retry this payment", exact: true })
        .click();
    await expect(
        page.getByText("Your key is ready with 2 Pollen."),
    ).toBeVisible();
    expect(signatures).toBe(1);
    expect(paidHeaders).toHaveLength(2);
    expect(paidHeaders[0]).toBe(paidHeaders[1]);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page
        .getByRole("button", { name: "Copy prepaid API key", exact: true })
        .click();
    await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toBe("sk_browser_fixture");
    await page
        .getByRole("button", { name: "Check remaining Pollen", exact: true })
        .click();
    await expect(
        page.getByText("Remaining Pollen: 2", { exact: true }),
    ).toBeVisible();
    const stored = await page.evaluate(() =>
        JSON.stringify([localStorage, sessionStorage]),
    );
    expect(stored).not.toContain("sk_browser_fixture");
    expect(stored).not.toContain(paidHeaders[0]);
    const warning = page.waitForEvent("dialog");
    const leave = page
        .getByRole("link", { name: "Terms", exact: true })
        .click();
    const dialog = await warning;
    expect(dialog.type()).toBe("beforeunload");
    await dialog.dismiss();
    await leave;
    await expect(
        page.getByRole("button", { name: "Copy prepaid API key" }),
    ).toBeVisible();
    await page
        .getByRole("checkbox", {
            name: "I have saved my prepaid key somewhere safe.",
        })
        .check();
    await page.getByRole("link", { name: "Terms", exact: true }).click();
    await expect(page).toHaveURL(/\/terms$/);
});

test("an approval that expires in the wallet can be retried without submitting the old proof", async ({
    page,
}) => {
    const now = Date.now();
    await page.clock.setFixedTime(now);
    await page.exposeFunction("expireFixturePrompt", () =>
        page.clock.setFixedTime(now + 61_000),
    );
    await page.evaluate(() => {
        const state = window as Window & {
            ethereum: {
                request: (args: { method: string }) => Promise<unknown>;
            };
            expireFixturePrompt: () => Promise<void>;
        };
        const request = state.ethereum.request;
        let firstApproval = true;
        state.ethereum.request = async (args) => {
            const result = await request(args);
            if (args.method === "eth_signTypedData_v4" && firstApproval) {
                firstApproval = false;
                await state.expireFixturePrompt();
            }
            return result;
        };
    });
    let payments = 0;
    await page.route("**/api/x402/keys/*", (route) => {
        if (!route.request().headers()["payment-signature"])
            return route.fallback();
        payments++;
        return route.fulfill({
            json: { key: "sk_browser_fixture", pollen: 2 },
        });
    });
    await page
        .getByRole("button", { name: "Review payment", exact: true })
        .click();
    await page
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
    await page
        .getByRole("button", { name: "Pay 2.00 USDC", exact: true })
        .click();
    await expect(
        page.getByText("Your approval expired before the payment was sent.", {
            exact: false,
        }),
    ).toBeVisible();
    expect(payments).toBe(0);
    expect(signatures).toBe(1);
    await page
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
    await page
        .getByRole("button", { name: "Pay 2.00 USDC", exact: true })
        .click();
    await expect(
        page.getByText("Your key is ready with 2 Pollen."),
    ).toBeVisible();
    expect(payments).toBe(1);
    expect(signatures).toBe(2);
});

test("quick amounts update the reviewed price and missing wallets get a specific message", async ({
    page,
}) => {
    await page.getByRole("button", { name: "5 USDC", exact: true }).click();
    await expect(
        page.getByLabel("Amount in USDC (1 USDC = 1 Pollen)"),
    ).toHaveValue("5.00");
    await page
        .getByRole("button", { name: "Review payment", exact: true })
        .click();
    await expect(
        page.getByText("Pay 5.00 USDC on Base for 5 Pollen."),
    ).toBeVisible();
    await page.evaluate(() => {
        delete (window as Window & { ethereum?: unknown }).ethereum;
    });
    await page
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
    await expect(
        page.getByText("No browser wallet was found.", { exact: false }),
    ).toBeVisible();
    expect(signatures).toBe(0);
});

for (const { code, method, message } of [
    {
        code: 4001,
        method: "eth_signTypedData_v4",
        message: "You declined the wallet request.",
    },
    {
        code: 4900,
        method: "eth_requestAccounts",
        message: "Your wallet is disconnected.",
    },
    {
        code: 4902,
        method: "wallet_switchEthereumChain",
        message: "Base is not available in your wallet.",
    },
])
    test(`wallet error ${code} is actionable and never submits a payment`, async ({
        page,
    }) => {
        let payments = 0;
        page.on("request", (request) => {
            if (request.headers()["payment-signature"]) payments++;
        });
        await page.evaluate(
            ({ code, method }) =>
                Object.assign(window, {
                    walletFailure: code,
                    walletFailureMethod: method,
                }),
            { code, method },
        );
        await page
            .getByRole("button", { name: "Review payment", exact: true })
            .click();
        await page
            .getByRole("button", { name: "Connect wallet", exact: true })
            .click();
        if (method === "eth_signTypedData_v4")
            await page
                .getByRole("button", { name: "Pay 2.00 USDC", exact: true })
                .click();
        await expect(page.getByText(message, { exact: false })).toBeVisible();
        expect(payments).toBe(0);
    });
