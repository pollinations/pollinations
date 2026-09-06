import { ApiError, gen, requireKey } from "./api.js";
import { BASE_URL } from "./config.js";
import { printError } from "./output.js";

// Returns null for non-402 so callers fall through to their generic error path.
export async function budgetHint(
    status: number,
    bodyText: string,
): Promise<string | null> {
    if (status !== 402) return null;
    let code: string | undefined;
    try {
        code = JSON.parse(bodyText)?.error?.code;
    } catch {
        // Non-JSON errors still get the general payment guidance below.
    }
    if (code === "KEY_BUDGET_EXHAUSTED") {
        return [
            "API key budget exhausted. Topping up the wallet does not increase the key budget.",
            "Manage key budget: https://enter.pollinations.ai/keys",
            `Server said: ${bodyText}`,
        ].join("\n");
    }
    const balance = await gen<{ balance?: number }>("/account/balance", {
        apiKey: requireKey(),
    })
        .then((r) => r.balance)
        .catch(() => null);
    const lines = [
        code === "INSUFFICIENT_BALANCE"
            ? "Insufficient pollen balance."
            : "Check your pollen balance and API key budget.",
        "Top up: https://enter.pollinations.ai/pollen",
        ...(code === "INSUFFICIENT_BALANCE"
            ? []
            : ["Manage key budget: https://enter.pollinations.ai/keys"]),
        "",
    ];
    if (balance != null) lines.push(`Account balance: ${balance} pollen`);
    lines.push(`Server said: ${bodyText}`);
    return lines.join("\n");
}

export async function fetchGen(
    path: string,
    init: RequestInit = {},
): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${requireKey()}`);
    const response = await fetch(`${BASE_URL}${path}`, {
        ...init,
        headers,
    });
    if (response.ok) return response;

    const body = await response.text().catch(() => "");
    const message =
        (await budgetHint(response.status, body)) ??
        `${response.status} ${response.statusText}: ${body}`;
    throw new ApiError(response.status, message);
}

export function exitWithError(error: unknown): never {
    printError(error instanceof Error ? error.message : "unknown error");
    process.exit(1);
}
