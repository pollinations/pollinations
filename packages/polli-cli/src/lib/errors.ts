import { createInterface } from "node:readline/promises";
import { ApiError, paymentHint, requireKey } from "./api.js";
import { POLLI_CLIENT } from "./client.js";
import { BASE_URL, resolveApiKey } from "./config.js";
import { ExitSignal, getOutputMode, printError } from "./output.js";

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
        paymentHint(response.status, body) ??
        `${response.status} ${response.statusText}: ${body}`;
    throw new ApiError(response.status, message);
}

export function exitWithError(error: unknown): never {
    if (error instanceof ExitSignal) throw error;
    printError(error instanceof Error ? error.message : "unknown error");
    throw new ExitSignal(1);
}
