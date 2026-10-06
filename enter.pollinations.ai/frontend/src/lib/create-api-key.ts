import { expiryDaysToExpiresIn } from "@shared/auth/authorize-config.ts";
import { apiClient } from "../api.ts";
import { readError } from "../components/community-endpoints/types.ts";

type Permissions = {
    allowedModels?: string[] | null;
    pollenBudget?: number | null;
    accountPermissions?: string[] | null;
    questPollenOnly?: boolean;
};

type CreateKeyInput = {
    name: string;
    prefix: "sk" | "pk";
    expiryDays?: number | null;
    description?: string;
    redirectUris?: string[];
    earningsEnabled?: boolean;
    /** Set by the consent screen to bind the key to the app being authorized. */
    consent?: {
        requestedClientId?: string;
        redirectUri?: string;
        redirectOrigin?: string;
        deviceUserCode?: string;
    };
    permissions?: Permissions;
};

type CreatedKey = {
    id: string;
    key: string;
    name: string | null;
    expiresIn: number | undefined;
    expiresAt?: string | null;
};

// Server-side creation keeps Better Auth as an implementation detail and lets
// us validate Pollinations-specific fields before the key exists.
export async function createKeyWithPermissions({
    name,
    prefix,
    expiryDays,
    description,
    redirectUris,
    earningsEnabled,
    consent,
    permissions,
}: CreateKeyInput): Promise<CreatedKey> {
    const expiresIn = expiryDaysToExpiresIn(expiryDays);
    const keyType: "publishable" | "secret" =
        prefix === "pk" ? "publishable" : "secret";
    const body = {
        name,
        type: keyType,
        expiresIn,
        description,
        redirectUris,
        earningsEnabled,
        consent,
        allowedModels: permissions?.allowedModels,
        pollenBudget: permissions?.pollenBudget,
        accountPermissions: permissions?.accountPermissions,
        questPollenOnly: permissions?.questPollenOnly,
    };

    const response = await apiClient.account.keys.$post({
        json: body,
    });

    if (!response.ok) {
        throw new Error(await readError(response));
    }

    const data = (await response.json()) as {
        id: string;
        key: string;
        name?: string | null;
        expiresAt?: string | null;
    };

    return {
        id: data.id,
        key: data.key,
        name: data.name ?? null,
        expiresIn,
        expiresAt: data.expiresAt,
    };
}
