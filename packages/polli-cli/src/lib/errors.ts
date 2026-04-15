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
    const lines = [
        "Insufficient pollen balance.",
        "Top up: https://enter.pollinations.ai",
        "",
    ];
    if (balance != null) lines.push(`Account balance: ${balance} pollen`);
    lines.push(`Server said: ${bodyText}`);
    return lines.join("\n");
}
