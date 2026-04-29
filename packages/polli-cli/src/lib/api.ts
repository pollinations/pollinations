import { BASE_URL, resolveApiKey } from "./config.js";
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

export const requireKey = (): string => {
    const key = resolveApiKey();
    if (!key) {
        printError("Not logged in. Run: polli auth login");
        printError("Or use: polli auth login --token <your-key>");
        process.exit(1);
    }
    return key;
};

interface RequestOptions {
    method?: string;
    body?: unknown;
    apiKey?: string;
}

const request = async <T>(
    baseUrl: string,
    path: string,
    options: RequestOptions = {},
): Promise<T> => {
    const { method = "GET", body, apiKey } = options;
    const key = resolveApiKey(apiKey);

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    if (key) headers.Authorization = `Bearer ${key}`;

    const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "Unknown error");
        throw new ApiError(
            res.status,
            `${res.status} ${res.statusText}: ${text}`,
        );
    }

    return res.json() as Promise<T>;
};

export const gen = <T>(path: string, options?: RequestOptions) =>
    request<T>(BASE_URL, path, options);
