import { loginWithDeviceFlow } from "../commands/auth.js";
import { ApiError, gen } from "../lib/api.js";
import { resolveApiKey } from "../lib/config.js";
import { printInfo, printSuccess } from "../lib/output.js";

// gen's response cache can answer an unauthenticated prompt, so a chat
// completion proves nothing — check the key itself.
export const keyIsValid = async (key: string) => {
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

interface ListedKey {
    id: string;
    name: string;
}

/**
 * Revoke every account key minted for a harness (`polli-harness-<id>`). The
 * creation endpoint enforces no name uniqueness, so a crashed `on` may have
 * left duplicates — delete by name, not by a remembered id. Best-effort:
 * without an account key there is nothing we can do from here.
 *
 * Returns the number of revoked keys.
 */
export const revokeHarnessKeys = async (harnessId: string): Promise<number> => {
    const accountKey = resolveApiKey();
    if (!accountKey) {
        printInfo(
            `No polli login available; revoke any "polli-harness-${harnessId}" keys manually: polli keys list`,
        );
        return 0;
    }
    const name = `polli-harness-${harnessId}`;
    const keys = await gen<ListedKey[]>("/account/keys", {
        apiKey: accountKey,
    });
    const ours = (Array.isArray(keys) ? keys : []).filter(
        (key) => key.name === name,
    );
    for (const key of ours) {
        await gen(`/account/keys/${key.id}`, {
            apiKey: accountKey,
            method: "DELETE",
        });
    }
    if (ours.length > 0) {
        printSuccess(
            `Revoked ${ours.length} API key${ours.length === 1 ? "" : "s"} named "${name}".`,
        );
    }
    return ours.length;
};
