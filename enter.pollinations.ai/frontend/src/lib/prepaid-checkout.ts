import { x402Client, x402HTTPClient } from "@x402/core/client";
import type { PaymentRequired } from "@x402/core/types";
import type { ClientEvmSigner } from "@x402/evm";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import {
    BaseError,
    createWalletClient,
    custom,
    type EIP1193Provider,
    isAddress,
} from "viem";
import { base } from "viem/chains";

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const WALLET_ERRORS: Record<string, string> = {
    wallet_missing:
        "No browser wallet was found. Open this page in a browser with an Ethereum wallet installed.",
    4001: "You declined the wallet request. No payment was submitted. You can connect again when ready.",
    4100: "Wallet access changed or is not authorized. Reconnect your wallet before paying.",
    4200: "This wallet does not support the required request. Try another Ethereum browser wallet.",
    4900: "Your wallet is disconnected. Restore its connection and try again.",
    4901: "Your wallet is on another network. Switch to Base and reconnect.",
    4902: "Base is not available in your wallet. Add the Base network in your wallet, then reconnect.",
    "-32002":
        "A wallet request is already open. Complete or dismiss it in your wallet first.",
};

/** Never display wallet error details: they can include signed payment data. */
export function prepaidWalletError(error: unknown): string {
    const detail =
        error instanceof BaseError
            ? error.walk((cause) =>
                  Boolean(
                      cause && typeof cause === "object" && "code" in cause,
                  ),
              )
            : error;
    const code =
        detail && typeof detail === "object" && "code" in detail
            ? String(detail.code)
            : "";
    return (
        WALLET_ERRORS[code] ??
        "Wallet approval could not complete. Check your wallet connection and try again."
    );
}

export function prepaidAmount(value: string): string {
    if (!/^\d+(\.\d{1,2})?$/.test(value))
        throw new Error("Choose an amount from $0.01 to $10,000 in cents.");
    const amount = Number(value);
    if (amount < 0.01 || amount > 10_000)
        throw new Error("Choose an amount from $0.01 to $10,000 in cents.");
    return amount.toFixed(2);
}

/** Only sign the exact amount the buyer reviewed, in native USDC on Base. */
export function validatePrepaidQuote(
    required: PaymentRequired,
    amount: string,
) {
    const units = BigInt(prepaidAmount(amount).replace(".", "")) * 10_000n;
    const payment = required.accepts?.find(
        (offer) =>
            offer.scheme === "exact" &&
            offer.network === "eip155:8453" &&
            offer.asset.toLowerCase() === BASE_USDC.toLowerCase() &&
            offer.amount === units.toString() &&
            isAddress(offer.payTo),
    );
    if (required.x402Version !== 2 || !payment)
        throw new Error(
            "Checkout did not offer the requested USDC amount on Base.",
        );
    return { ...required, accepts: [payment] };
}

export async function loadPrepaidQuote(url: string, amount: string) {
    const response = await fetch(url, {
        method: "POST",
        credentials: "omit",
        cache: "no-store",
        headers: { Accept: "application/json" },
    });
    if (response.status !== 402)
        throw new Error("Prepaid checkout is unavailable. Try again later.");
    const http = new x402HTTPClient(new x402Client());
    return validatePrepaidQuote(
        http.getPaymentRequiredResponse((name) => response.headers.get(name)),
        amount,
    );
}

export async function prepaidPaymentHeaders(
    required: PaymentRequired,
    amount: string,
    signer: ClientEvmSigner,
) {
    const quote = validatePrepaidQuote(required, amount);
    const client = new x402Client()
        .setSpendControls({ maxAmountPerPayment: `$${prepaidAmount(amount)}` })
        .register("eip155:8453", new ExactEvmScheme(signer));
    const http = new x402HTTPClient(client);
    return http.encodePaymentSignatureHeader(
        await http.createPaymentPayload(quote),
    );
}

export async function connectPrepaidWallet() {
    const provider = (window as Window & { ethereum?: EIP1193Provider })
        .ethereum;
    if (!provider)
        throw Object.assign(new Error("Browser wallet missing"), {
            code: "wallet_missing",
        });
    const wallet = createWalletClient({
        chain: base,
        transport: custom(provider),
    });
    const [address] = await wallet.requestAddresses();
    if (!address) throw new Error("Choose an account in your wallet.");
    await wallet.switchChain({ id: base.id });
    return {
        address,
        signTypedData: async (data) => {
            const [currentAddress] = await wallet.getAddresses();
            if (currentAddress?.toLowerCase() !== address.toLowerCase())
                throw Object.assign(new Error("Wallet account changed"), {
                    code: 4100,
                });
            if ((await wallet.getChainId()) !== base.id)
                throw Object.assign(new Error("Wallet network changed"), {
                    code: 4901,
                });
            return wallet.signTypedData({
                ...data,
                account: address,
            } as Parameters<typeof wallet.signTypedData>[0]);
        },
    } satisfies ClientEvmSigner;
}

/** The caller keeps these headers for retries; never sign again after sending. */
export async function submitPrepaidPayment(
    url: string,
    headers: Record<string, string>,
) {
    const response = await fetch(url, {
        method: "POST",
        credentials: "omit",
        cache: "no-store",
        headers: { ...headers, Accept: "application/json" },
    });
    if (!response.ok)
        throw new Error(
            "Payment is not confirmed. Retry this payment to recover the same key without paying again.",
        );
    const result: unknown = await response.json();
    if (
        !result ||
        typeof result !== "object" ||
        !("key" in result) ||
        typeof result.key !== "string" ||
        !result.key.startsWith("sk_") ||
        !("pollen" in result) ||
        typeof result.pollen !== "number"
    )
        throw new Error("Couldn’t read the prepaid key. Retry this payment.");
    return { key: result.key, pollen: result.pollen };
}

export async function prepaidBalance(
    url: string,
    key: string,
): Promise<number> {
    const response = await fetch(url, {
        credentials: "omit",
        cache: "no-store",
        headers: { Authorization: `Bearer ${key}` },
    });
    if (!response.ok) throw new Error("Balance unavailable");
    const data: unknown = await response.json();
    if (
        !data ||
        typeof data !== "object" ||
        !("balance" in data) ||
        typeof data.balance !== "number" ||
        !Number.isFinite(data.balance) ||
        data.balance < 0
    )
        throw new Error("Invalid balance response");
    return data.balance;
}
