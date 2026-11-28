import { createInterface } from "node:readline/promises";
import { ApiError, gen, paymentError, requireKey } from "./api.js";
import { POLLI_CLIENT } from "./client.js";
import { BASE_URL, resolveApiKey } from "./config.js";
import {
    ExitSignal,
    formatDollars,
    getOutputMode,
    printError,
} from "./output.js";

// Returns null for non-402 so callers fall through to their generic error path.
export async function budgetHint(
    status: number,
    bodyText: string,
): Promise<string | null> {
    if (status !== 402) return null;
    const { code, message } = paymentError(bodyText);
    if (message) return message;
    if (code === "KEY_BUDGET_EXHAUSTED") {
        return "Key budget too low. Review it at https://enter.pollinations.ai/keys";
    }
    const balance = await gen<{ accountBalance?: { total: number } }>(
        "/account/balance",
        {
            apiKey: requireKey(),
        },
    )
        .then((r) => r.accountBalance?.total)
        .catch(() => null);
    const lines = [
        code === "INSUFFICIENT_BALANCE"
            ? "Balance too low."
            : "Check your balance and API key budget.",
        "Balance: https://enter.pollinations.ai/pollen",
        ...(code === "INSUFFICIENT_BALANCE"
            ? ["Top up: https://enter.pollinations.ai/top-up"]
            : ["Manage key budget: https://enter.pollinations.ai/keys"]),
    ];
    if (balance != null)
        lines.push(`Account balance: ${formatDollars(balance)}`);
    if (bodyText) lines.push(bodyText);
    return lines.join("\n");
}

async function generationKey(): Promise<string> {
    const key = resolveApiKey();
    if (key) return key;
    if (
        getOutputMode() !== "human" ||
        !process.stdin.isTTY ||
        !process.stderr.isTTY
    ) {
        return requireKey();
    }

    const prompt = createInterface({
        input: process.stdin,
        output: process.stderr,
    });
    let answer: string;
    try {
        answer = await prompt.question("Not logged in. Log in now? [Y/n] ");
    } finally {
        prompt.close();
    }
    if (answer.trim() && !/^y(es)?$/i.test(answer.trim())) {
        throw new ApiError(401, "Login required. Run: polli auth login");
    }

    const { loginWithDeviceFlow } = await import("../commands/auth.js");
    return loginWithDeviceFlow();
}

export async function fetchGen(
    path: string,
    init: RequestInit = {},
): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${await generationKey()}`);
    headers.set("X-Polli-Client", POLLI_CLIENT);
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
    if (error instanceof ExitSignal) throw error;
    printError(error instanceof Error ? error.message : "unknown error");
    throw new ExitSignal(1);
}
