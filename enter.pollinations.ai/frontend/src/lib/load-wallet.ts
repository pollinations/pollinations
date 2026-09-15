import { apiClient } from "../api.ts";
import { apiResponseError } from "./api-error.ts";

/** Confirm credit before reading balances so a success message never precedes its funds. */
export async function loadWallet(sessionId?: string) {
    const payment = sessionId
        ? await apiClient.stripe["checkout-status"][":sessionId"].$get({
              param: { sessionId },
          })
        : null;
    if (payment && !payment.ok)
        throw await apiResponseError(
            payment,
            "Couldn’t check your payment. Try again.",
        );
    const [balance, billing] = await Promise.all([
        apiClient.customer.balance.$get(),
        apiClient.stripe.billing.$get(),
    ]);
    const failed = [balance, billing].find((response) => !response.ok);
    if (failed)
        throw await apiResponseError(
            failed,
            "Couldn’t load your wallet. Try again.",
        );
    const [wallet, billingData, status] = await Promise.all([
        balance.json(),
        billing.json(),
        payment?.json(),
    ]);
    return {
        tierBalance: wallet.tierBalance,
        packBalance: wallet.packBalance,
        billing: billingData,
        payment: status?.status,
    };
}
