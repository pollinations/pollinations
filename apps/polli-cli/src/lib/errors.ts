import { enter } from "./api.js";
import { resolveApiKey } from "./config.js";

interface BalanceResponse {
    balance?: number;
}

interface KeyInfoResponse {
    pollenBudget?: number | null;
}

/**
 * When a gen call fails with 402, fetch the account balance and key budget
 * and return a human-readable hint. Returns null for non-402 errors so the
 * caller can fall through to its generic error path.
 */
export async function budgetHint(
    status: number,
    bodyText: string,
): Promise<string | null> {
    if (status !== 402) return null;

    const key = resolveApiKey();
    const [balance, keyInfo] = await Promise.all([
        key
            ? enter<BalanceResponse>("/api/account/balance", {
                  apiKey: key,
              }).catch(() => null)
            : null,
        key
            ? enter<KeyInfoResponse>("/api/account/key", {
                  apiKey: key,
              }).catch(() => null)
            : null,
    ]);

    const accountBalance = balance?.balance ?? null;
    const keyBudget = keyInfo?.pollenBudget ?? null;

    const lines = [
        `402 Insufficient balance: ${bodyText}`,
        "",
        `account balance: ${accountBalance ?? "unknown"} pollen`,
        `key budget cap:  ${keyBudget ?? "unlimited"} pollen`,
        "",
        "Fix:",
        "  • Run `polli auth login` to get a fresh key with the default budget",
        "  • Top up pollen at https://enter.pollinations.ai",
    ];

    return lines.join("\n");
}
