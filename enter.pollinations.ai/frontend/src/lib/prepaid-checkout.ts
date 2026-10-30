import { x402Client, x402HTTPClient } from "@x402/core/client";
import type { PaymentRequired } from "@x402/core/types";
import type { ClientEvmSigner } from "@x402/evm";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import {
    createWalletClient,
    custom,
    type EIP1193Provider,
    isAddress,
} from "viem";
import { base } from "viem/chains";

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

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
        throw new Error(
            "Open this page in a browser with an Ethereum wallet installed.",
        );
    const wallet = createWalletClient({
        chain: base,
        transport: custom(provider),
    });
    const [address] = await wallet.requestAddresses();
    if (!address) throw new Error("Choose an account in your wallet.");
    await wallet.switchChain({ id: base.id });
    return {
        address,
        signTypedData: (data) =>
            wallet.signTypedData({
                ...data,
                account: address,
            } as Parameters<typeof wallet.signTypedData>[0]),
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
