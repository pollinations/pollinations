export type ModelPermissionEntry =
    | string
    | { id: string; pollenType: "quest" | "paid" };

export interface ApiKey {
    id: string;
    name?: string | null;
    start?: string | null;
    createdAt: string;
    lastRequest?: string | null;
    expiresAt?: string | null;
    enabled?: boolean;
    permissions: Record<string, string[] | ModelPermissionEntry[]> | null;
    metadata: Record<string, unknown> | null;
    pollenBalance?: number | null;
    pollenType?: "quest" | "paid" | null;
    questPollenOnly?: boolean | null;
    byopClientKeyId?: string | null;
}

export interface ApiKeyUpdateParams {
    name?: string;
    allowedModels?: (string | ModelPermissionEntry)[] | null;
    pollenBudget?: number | null;
    pollenType?: "quest" | "paid" | null;
    questPollenOnly?: boolean | null;
    accountPermissions?: string[] | null;
    expiresAt?: Date | null;
}

export interface ApiKeyManagerProps {
    apiKeys: ApiKey[];
    onCreate: (formData: CreateApiKey) => Promise<CreateApiKeyResponse>;
    onUpdate: (id: string, updates: ApiKeyUpdateParams) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
}

export type CreateApiKey = {
    name: string;
    description?: string;
    keyType?: "publishable" | "secret";
    /** Model IDs this key can access. null = all models allowed */
    allowedModels?: (string | ModelPermissionEntry)[] | null;
    /** Pollen budget cap for this key. null = unlimited */
    pollenBudget?: number | null;
    /** Restrict this key to only use quest or paid pollen. null = unrestricted */
    pollenType?: "quest" | "paid" | null;
    /** When true, quest models never use paid pollen for this key */
    questPollenOnly?: boolean | null;
    /** Days until expiry. null = no expiry */
    expiryDays?: number | null;
    /** Account permissions: ["profile", "usage", "keys"]. null = no permissions */
    accountPermissions?: string[] | null;
    /** Allowed OAuth redirect URLs for publishable keys (RFC 8252 port-agnostic loopback) */
    redirectUris?: string[];
    /** Enable BYOP app earnings for publishable app keys */
    earningsEnabled?: boolean;
};

export type CreateApiKeyResponse = ApiKey & {
    key: string;
};
