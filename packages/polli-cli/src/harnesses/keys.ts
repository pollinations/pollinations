import { loginWithDeviceFlow } from "../commands/auth.js";
import { ApiError, gen } from "../lib/api.js";
import { resolveApiKey } from "../lib/config.js";
import { printInfo, printSuccess } from "../lib/output.js";

/** The dedicated child key each harness mints (see `resolveHarnessKey`). */
export const harnessKeyName = (harnessId: string) =>
    `polli-harness-${harnessId}`;

/**
 * Check the usage side effect of a completed smoke request: the dedicated key
 * must show a request recorded at/after `sinceMs`, or the router answered from
 * a cache or under a different account. A missing side effect throws a clear
 * harness error so the caller can roll back like a smoke failure.
 */
export const assertKeyUsage = async (keyName: string, sinceMs: number) => {
    const { data } = await gen<{
        data: Array<{ name: string | null; lastRequest: string | null }>;
    }>("/account/keys", { apiKey: resolveApiKey() });
    const recorded = data.some((key) => {
        if (key.name !== keyName || key.lastRequest === null) return false;
        const at = new Date(key.lastRequest).getTime();
        return Number.isFinite(at) && at >= sinceMs;
    });
    if (!recorded) {
        throw new Error(
            `No request recorded for harness key "${keyName}" after the smoke test. ` +
                "The router may not be attributing traffic to the dedicated key — check: polli keys list --json",
        );
    }
};

// gen's response cache can answer an unauthenticated prompt, so a chat
// completion proves nothing — check the key itself.
const keyIsValid = async (key: string) => {
    try {
        const info = await gen<{ valid: boolean }>("/account/key", {
            apiKey: key,
        });
        return info.valid === true;
    } catch (error) {
        if (error instanceof ApiError && error.status === 401) return false;
        throw error;
    }
};

/**
 * Key the harness will call gen with: the one already in its config if still
 * valid, otherwise a child key named after the harness, minted from the polli
 * login (logging in first if needed).
 *
 * `accountPermissions` are forwarded to the key creation endpoint. Harness
 * integrations that surface usage or balance (like the Pollinations OpenCode
 * plugin) need `usage` on the dedicated key, or their quota reads fail.
 */
export const resolveHarnessKey = async (
    harness: {
        id: string;
        label: string;
        existingKey: string | null;
        accountPermissions?: string[];
    },
    options: { browser?: boolean },
): Promise<string> => {
    const existing = harness.existingKey;
    if (existing && (await keyIsValid(existing))) {
        printInfo(
            `Reusing the Pollinations key already stored for ${harness.label}.`,
        );
        return existing;
    }

    const accountKey =
        resolveApiKey() ??
        (await loginWithDeviceFlow({ browser: options.browser }));
    const name = harnessKeyName(harness.id);
    const created = await gen<{ key: string }>("/account/keys", {
        method: "POST",
        apiKey: accountKey,
        body: {
            name,
            type: "secret",
            ...(harness.accountPermissions
                ? { accountPermissions: harness.accountPermissions }
                : {}),
        },
    });
    printSuccess(`Created API key "${name}" for ${harness.label}.`);
    return created.key;
};
