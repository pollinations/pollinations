import { loginWithDeviceFlow } from "../commands/auth.js";
import { ApiError, gen } from "../lib/api.js";
import { resolveApiKey } from "../lib/config.js";
import { printInfo, printSuccess } from "../lib/output.js";

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
    const name = `polli-harness-${harness.id}`;
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
