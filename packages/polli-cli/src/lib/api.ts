import { BASE_URL, resolveApiKey } from "./config.js";
import { printError } from "./output.js";
import { withRetry } from "./retry.js";
import { validate } from "./validation.js";
import { logActivity } from "./logger.js";

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
        printError(
            "Or pipe a key: printf '%s' '<your-key>' | polli auth login --with-token",
        );
        process.exit(1);
    }
    return key;
};

interface RequestOptions {
    method?: string;
    body?: unknown;
    apiKey?: string;
    retry?: boolean;
    retryOptions?: {
        maxRetries?: number;
        baseDelay?: number;
    };
}

const request = async <T>(
    baseUrl: string,
    path: string,
    options: RequestOptions = {},
): Promise<T> => {
    const { method = "GET", body, apiKey, retry = true, retryOptions } = options;
    const key = resolveApiKey(apiKey);
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    if (key) headers.Authorization = `Bearer ${key}`;

    const fn = async () => {
        const res = await fetch(`${baseUrl}${path}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) {
            const text = await res.text().catch(() => "Unknown error");
            logActivity("api_error", { path, status: res.status, error: text });
            throw new ApiError(res.status, `${res.status} ${res.statusText}: ${text}`);
        }
        return res.json() as Promise<T>;
    };

    if (retry) {
        return withRetry(fn, {
            maxRetries: retryOptions?.maxRetries ?? 3,
            baseDelay: retryOptions?.baseDelay ?? 500,
        });
    }
    return fn();
};

export const gen = <T>(path: string, options?: RequestOptions) =>
    request<T>(BASE_URL, path, options);

// Helper to make authenticated request with Zod validation
export async function genValidated<T>(
    path: string,
    schema: import("zod").ZodSchema<T>,
    options?: RequestOptions,
): Promise<T> {
    const data = await gen<unknown>(path, options);
    return validate(schema, data);
}