import { enter, requireKey } from "./api.js";

// Returns null for non-402 so callers fall through to their generic error path.
export async function budgetHint(
    status: number,
    bodyText: string,
): Promise<string | null> {
    if (status !== 402) return null;
    const balance = await enter<{ balance?: number }>("/api/account/balance", {
        apiKey: requireKey(),
    })
        .then((r) => r.balance)
        .catch(() => null);
    const lines = [`402 Insufficient balance: ${bodyText}`, ""];
    if (balance != null) lines.push(`Account balance: ${balance} pollen`, "");
    lines.push("Fix: top up at https://enter.pollinations.ai");
    return lines.join("\n");
}
