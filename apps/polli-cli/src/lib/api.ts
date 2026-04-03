import { BASE_URL, ENTER_URL, resolveApiKey } from "./config.js";
import { printError } from "./output.js";

export class ApiError extends Error {
    constructor(
        public readonly status: number,
        message: string,
    ) {
        super(message);
        this.name = "ApiError";
    }
}

/** Resolve API key or exit with error if missing */
export const requireKey = (): string => {
    const key = resolveApiKey();
    if (!key) {
        printError("Not logged in. Run: polli auth login");
        printError("Or use: polli auth login --token <your-key>");
        process.exit(1);
    }
    return key;
};

const makeHeaders = (apiKey?: string): Record<string, string> => {
    const key = resolveApiKey(apiKey);
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    if (key) {
        headers.Authorization = `Bearer ${key}`;
    }
    return headers;
};

const request = async <T>(
    baseUrl: string,
    path: string,
    options: {
        method?: string;
        body?: unknown;
        apiKey?: string;
        timeout?: number;
    } = {},
): Promise<T> => {
    const { method = "GET", body, apiKey, timeout = 30_000 } = options;
    const url = `${baseUrl}${path}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const res = await fetch(url, {
        method,
        headers: makeHeaders(apiKey),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!res.ok) {
        const text = await res.text().catch(() => "Unknown error");
        throw new ApiError(
            res.status,
            `${res.status} ${res.statusText}: ${text}`,
        );
    }

    return res.json() as Promise<T>;
};

/** Calls gen.pollinations.ai */
export const gen = <T>(
    path: string,
    options?: {
        method?: string;
        body?: unknown;
        apiKey?: string;
        timeout?: number;
    },
) => request<T>(BASE_URL, path, options);

/** Calls enter.pollinations.ai */
export const enter = <T>(
    path: string,
    options?: {
        method?: string;
        body?: unknown;
        apiKey?: string;
        timeout?: number;
    },
) => request<T>(ENTER_URL, path, options);
