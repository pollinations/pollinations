import { loginWithDeviceFlow } from "../commands/auth.js";
import { ApiError, gen } from "../lib/api.js";
import { resolveApiKey } from "../lib/config.js";
import { printInfo, printSuccess } from "../lib/output.js";

export interface HarnessKeyLease {
    key: string;
    created: boolean;
    revoke: () => Promise<void>;
}

export const normalizeHarnessKey = (key: unknown): string | null => {
    if (typeof key !== "string") return null;
    const normalized = key.trim();
    return /^sk_[^\s]+$/u.test(normalized) ? normalized : null;
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

const revokeHarnessKey = (accountKey: string, id: string) =>
    gen(`/account/keys/${encodeURIComponent(id)}`, {
        method: "DELETE",
        apiKey: accountKey,
    });

export const resolveHarnessKeyLease = async (
    harness: { id: string; label: string; existingKey: string | null },
    options: { browser?: boolean },
): Promise<HarnessKeyLease> => {
    const existing = normalizeHarnessKey(harness.existingKey);
    if (existing && (await keyIsValid(existing))) {
        printInfo(
            `Reusing the Pollinations key already stored for ${harness.label}.`,
        );
        return { key: existing, created: false, revoke: async () => {} };
    }

    const accountKey = normalizeHarnessKey(
        resolveApiKey() ??
            (await loginWithDeviceFlow({ browser: options.browser })),
    );
    if (!accountKey)
        throw new Error("Pollinations login did not return a secret API key");
    const name = `polli-harness-${harness.id}`;
    const created = await gen<{ id: string; key: string }>("/account/keys", {
        method: "POST",
        apiKey: accountKey,
        body: { name, type: "secret" },
    });
    const key = normalizeHarnessKey(created.key);
    if (!key || typeof created.id !== "string" || !created.id.trim()) {
        if (typeof created.id === "string" && created.id.trim()) {
            await revokeHarnessKey(accountKey, created.id.trim()).catch(
                () => {},
            );
        }
        throw new Error("Pollinations returned an invalid secret harness key");
    }
    printSuccess(`Created API key "${name}" for ${harness.label}.`);
    let revoked = false;
    return {
        key,
        created: true,
        revoke: async () => {
            if (revoked) return;
            revoked = true;
            await revokeHarnessKey(accountKey, created.id.trim());
        },
    };
};

/**
 * Key the harness will call gen with: the one already in its config if still
 * valid, otherwise a child key named after the harness, minted from the polli
 * login (logging in first if needed).
 */
export const resolveHarnessKey = async (
    harness: { id: string; label: string; existingKey: string | null },
    options: { browser?: boolean },
): Promise<string> => {
    return (await resolveHarnessKeyLease(harness, options)).key;
};
