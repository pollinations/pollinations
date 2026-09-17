import { BASE_URL, resolveApiKey } from "./config.js";
import { fail, printError } from "./output.js";

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
        fail(
            "Or pipe a key: printf '%s' '<your-key>' | polli auth login --with-token",
        );
    }
    return key;
};

interface RequestOptions {
    method?: string;
    body?: unknown;
    apiKey?: string;
}

const fetchFrom = async (
    baseUrl: string,
    path: string,
    options: RequestOptions = {},
) => {
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

    return res;
};

const request = async <T>(
    baseUrl: string,
    path: string,
    options: RequestOptions = {},
): Promise<T> => (await fetchFrom(baseUrl, path, options)).json() as Promise<T>;

const requestText = async (
    baseUrl: string,
    path: string,
    options: RequestOptions = {},
): Promise<string> => (await fetchFrom(baseUrl, path, options)).text();

export const gen = <T>(path: string, options?: RequestOptions) =>
    request<T>(BASE_URL, path, options);

/** Fetch a response as raw text (used for `format=csv` exports). */
export const genText = (path: string, options?: RequestOptions) =>
    requestText(BASE_URL, path, options);
