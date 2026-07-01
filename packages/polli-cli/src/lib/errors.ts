import { gen } from "./api.js";
import { requireKey } from "./api.js";

export async function budgetHint(
    status: number,
    bodyText: string,
): Promise<string | null> {
    if (status !== 402) return null;
    const key = await requireKey();
    const balance = await gen<{ balance?: number }>("/account/balance", {
        apiKey: key,
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

export function isNetworkError(err: unknown): boolean {
    if (err instanceof Error) {
        const msg = err.message;
        return msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT") ||
            msg.includes("ENOTFOUND") || msg.includes("EPIPE") ||
            msg.includes("fetch failed");
    }
    return false;
}