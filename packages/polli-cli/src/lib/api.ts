import { POLLI_CLIENT } from "./client.js";
import { BASE_URL, resolveApiKey } from "./config.js";
import { fail, printError } from "./output.js";

export class ApiError extends Error {
    constructor(
        public readonly status: number,
        message: string,
        public readonly body = "",
    ) {
        super(message);
        this.name = "ApiError";
    }
}

export const requireKey = (): string => {
    const key = resolveApiKey();
    if (!key) {
        printError("Not logged in. Run: polli auth login");
        return fail(
            "Or pipe a key: printf '%s' '<your-key>' | polli auth login --with-token",
        );
    }
    return key;
};

// The consent screen leaves these unticked, so a login approved as-is gets a
// 403 from every route that needs one. Name the box to tick instead.
const PERMISSION_HINTS: Record<string, string> = {
    keys: 'Your login didn\'t allow managing keys, agents and models. Run `polli auth login` again and tick "Manage keys, agents and models".',
    machines:
        'Your login didn\'t allow sandboxes. Run `polli auth login` again and tick "Run hosted sandboxes".',
    sites: 'Your login didn\'t allow sites. Run `polli auth login` again and tick "Publish sites on pollinations.app".',
};

const permissionHint = (status: number, text: string) => {
    const permission =
        status === 403 && text.match(/'account:(keys|machines|sites)'/)?.[1];
    if (!permission) return undefined;
    // Gen's sandbox refusal also links a page that adds it to this key.
    const grant = text.match(/https:\/\/[^\s"]+\/grant\?[^\s"]+/)?.[0];
    const hint = PERMISSION_HINTS[permission];
    return grant ? `${hint}\nOr allow it for this login: ${grant}` : hint;
};

interface RequestOptions {
    method?: string;
    body?: unknown;
    apiKey?: string;
}

const send = async (
    baseUrl: string,
    path: string,
    options: RequestOptions = {},
): Promise<Response> => {
    const { method = "GET", body, apiKey } = options;
    const key = resolveApiKey(apiKey);

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Polli-Client": POLLI_CLIENT,
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
            permissionHint(res.status, text) ??
                `${res.status} ${res.statusText}: ${text}`,
            text,
        );
    }

    return res;
};

const request = async <T>(
    baseUrl: string,
    path: string,
    options: RequestOptions = {},
): Promise<T> => {
    const res = await send(baseUrl, path, options);
    return res.json() as Promise<T>;
};

export const gen = <T>(path: string, options?: RequestOptions) =>
    request<T>(BASE_URL, path, options);

/** Same as `gen`, but returns the raw response body for non-JSON formats
 * (e.g. `format=csv` exports). */
export const genText = async (path: string, options?: RequestOptions) =>
    (await send(BASE_URL, path, options)).text();
