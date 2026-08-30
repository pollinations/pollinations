import { randomUUID } from "node:crypto";
import { loginWithDeviceFlow } from "../commands/auth.js";
import { ApiError, gen } from "../lib/api.js";
import { ENTER_URL, resolveApiKey } from "../lib/config.js";
import { printInfo, printSuccess } from "../lib/output.js";

export const normalizeSecretKey = (key: unknown): string | null => {
    if (typeof key !== "string") return null;
    const normalized = key.trim();
    return /^sk_[^\s]+$/u.test(normalized) ? normalized : null;
};

export const isSecretHarnessKey = (key: unknown): key is string =>
    normalizeSecretKey(key) !== null;

// gen's response cache can answer an unauthenticated prompt, so a chat
// completion proves nothing — check the key itself.
export const inspectHarnessKey = async (key: string) => {
    const normalized = normalizeSecretKey(key);
    if (!normalized) return null;
    try {
        const info = await gen<{
            valid: boolean;
            type?: string;
        }>("/account/key", {
            apiKey: normalized,
        });
        if (info.valid !== true || (info.type && info.type !== "secret")) {
            return null;
        }
        return info;
    } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
    }
};

export const isHarnessKeyValid = async (key: string) =>
    Boolean(await inspectHarnessKey(key));

export interface HarnessKeyLease {
    key: string;
    created: boolean;
    revoke: () => Promise<void>;
}

export interface AccountKeySummary {
    id: string;
    name: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The account key list is read from Enter directly so cleanup can be
 * reconciled against the authoritative account API, even when the create
 * response is truncated or lost. The response intentionally excludes secret
 * key values.
 */
export const listAccountKeys = async (
    apiKey: string,
): Promise<AccountKeySummary[]> => {
    const response = await fetch(
        `${ENTER_URL.replace(/\/+$/u, "")}/api/account/keys`,
        {
            headers: { Authorization: `Bearer ${apiKey}` },
        },
    );
    if (!response.ok) {
        throw new ApiError(
            response.status,
            `${response.status} ${response.statusText}`,
        );
    }

    let body: unknown;
    try {
        body = await response.json();
    } catch {
        throw new Error("Pollinations account key listing was not valid JSON");
    }
    if (!isRecord(body) || !Array.isArray(body.data)) {
        throw new Error(
            "Pollinations account key listing has an invalid schema",
        );
    }

    const keys: AccountKeySummary[] = [];
    for (const entry of body.data) {
        if (
            !isRecord(entry) ||
            typeof entry.id !== "string" ||
            !entry.id.trim() ||
            typeof entry.name !== "string" ||
            !entry.name
        ) {
            throw new Error(
                "Pollinations account key listing has an invalid schema",
            );
        }
        keys.push({ id: entry.id, name: entry.name });
    }
    return keys;
};

const revokeAccountKey = (accountKey: string, id: string) =>
    gen(`/account/keys/${encodeURIComponent(id)}`, {
        method: "DELETE",
        apiKey: accountKey,
    });

const reconcileCreatedKey = async ({
    accountKey,
    name,
    observedBeforeIds,
}: {
    accountKey: string;
    name: string;
    observedBeforeIds: ReadonlySet<string>;
}): Promise<void> => {
    const keys = await listAccountKeys(accountKey);
    const candidates = keys.filter(
        (key) => key.name === name && !observedBeforeIds.has(key.id),
    );
    // A unique name plus a new id is the only safe match. Never guess when
    // the list is stale, duplicated, or contains multiple matching keys.
    if (candidates.length !== 1) {
        throw new Error(
            `Could not uniquely reconcile created API key (found ${candidates.length} matches)`,
        );
    }
    await revokeAccountKey(accountKey, candidates[0].id);
};

const uniqueHarnessKeyName = (id: string) =>
    `polli-harness-${id}-${randomUUID()}`;

export const withHarnessKeyLease = async <T>(
    lease: HarnessKeyLease,
    operation: (key: string) => Promise<T> | T,
): Promise<T> => {
    try {
        const result = await operation(lease.key);
        if (
            isRecord(result) &&
            Object.hasOwn(result, "configured") &&
            result.configured === false
        ) {
            throw new Error(
                "Harness setup did not produce a configured result",
            );
        }
        return result;
    } catch (error) {
        if (lease.created) {
            try {
                await lease.revoke();
            } catch (cleanupError) {
                throw new AggregateError(
                    [error, cleanupError],
                    "Harness setup failed and its API key could not be revoked",
                );
            }
        }
        throw error;
    }
};

/**
 * Key the harness will call gen with: the one already in its config if still
 * valid, otherwise a uniquely named child key minted from the polli login
 * (logging in first if needed). The account-key list is captured before minting
 * so a malformed create response can only reconcile one newly observed match.
 */
export const resolveHarnessKey = async (
    harness: { id: string; label: string; existingKey: string | null },
    options: {
        browser?: boolean;
        beforeCreate?: (accountKey: string) => Promise<void>;
    },
): Promise<HarnessKeyLease> => {
    const existing = normalizeSecretKey(harness.existingKey);
    if (
        existing &&
        isSecretHarnessKey(existing) &&
        (await inspectHarnessKey(existing))
    ) {
        printInfo(
            `Reusing the Pollinations key already stored for ${harness.label}.`,
        );
        return { key: existing, created: false, revoke: async () => {} };
    }

    const accountKey = normalizeSecretKey(
        resolveApiKey() ??
            (await loginWithDeviceFlow({ browser: options.browser })),
    );
    if (!accountKey) {
        throw new Error("Pollinations login did not return a secret API key");
    }
    if (options.beforeCreate) await options.beforeCreate(accountKey);
    const name = uniqueHarnessKeyName(harness.id);
    const observedBefore = await listAccountKeys(accountKey);
    const observedBeforeIds = new Set(observedBefore.map(({ id }) => id));
    let created: unknown;
    try {
        created = await gen<unknown>("/account/keys", {
            method: "POST",
            apiKey: accountKey,
            body: { name, type: "secret" },
        });
    } catch (error) {
        try {
            await reconcileCreatedKey({
                accountKey,
                name,
                observedBeforeIds,
            });
        } catch {
            // Preserve the create error. No deletion is claimed when the
            // authoritative list cannot establish a unique new key.
        }
        throw error;
    }
    const id =
        isRecord(created) && typeof created.id === "string"
            ? created.id.trim()
            : "";
    const revokeCreated = async () => {
        if (id && !observedBeforeIds.has(id)) {
            await revokeAccountKey(accountKey, id);
            return;
        }
        await reconcileCreatedKey({
            accountKey,
            name,
            observedBeforeIds,
        });
    };
    const failAfterCleanup = async (message: string): Promise<never> => {
        const setupError = new Error(message);
        try {
            await revokeCreated();
        } catch (cleanupError) {
            throw new AggregateError([setupError, cleanupError], message);
        }
        throw setupError;
    };
    const key = normalizeSecretKey(isRecord(created) ? created.key : undefined);
    if (!key) {
        return failAfterCleanup(
            "Pollinations returned an invalid secret harness key",
        );
    }
    if (!id) {
        return failAfterCleanup(
            "Pollinations returned a harness key without an id",
        );
    }
    if (observedBeforeIds.has(id)) {
        return failAfterCleanup(
            "Pollinations returned a pre-existing harness key id",
        );
    }
    printSuccess(`Created API key "${name}" for ${harness.label}.`);
    let revoked = false;
    return {
        key,
        created: true,
        revoke: async () => {
            if (revoked) return;
            revoked = true;
            await revokeCreated();
        },
    };
};
