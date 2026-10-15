export interface ApiKey {
    id: string;
    name?: string | null;
    start?: string | null;
    createdAt: string;
    lastRequest?: string | null;
    expiresAt?: string | null;
    enabled?: boolean;
    permissions: Record<string, string[]> | null;
    metadata: Record<string, unknown> | null;
    pollenBalance?: number | null;
    questPollenOnly?: boolean;
    byopClientKeyId?: string | null;
}

export interface ApiKeyUpdateParams {
    name?: string;
    allowedModels?: string[] | null;
    pollenBudget?: number | null;
    accountPermissions?: string[] | null;
    questPollenOnly?: boolean;
    expiresAt?: Date | null;
    redirectUris?: string[];
    earningsEnabled?: boolean;
}

export interface ApiKeyManagerProps {
    apiKeys: ApiKey[];
    onCreate: (formData: CreateApiKey) => Promise<CreateApiKeyResponse>;
    onUpdate: (id: string, updates: ApiKeyUpdateParams) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    /** Replaces a secret key's value and returns the new secret. */
    onRotate: (id: string) => Promise<string>;
}

export type CreateApiKey = {
    name: string;
    description?: string;
    keyType?: "publishable" | "secret";
    /** Model IDs this key can access. null = all models allowed */
    allowedModels?: string[] | null;
    /** Pollen budget cap for this key. null = unlimited */
    pollenBudget?: number | null;
    /** Days until expiry. null = no expiry */
    expiryDays?: number | null;
    /** Account permissions: ["profile", "usage", "keys", "machines"]. null = no permissions */
    accountPermissions?: string[] | null;
    /** Never spend paid Pollen; requests stop when Quest Pollen runs out */
    questPollenOnly?: boolean;
    /** Allowed OAuth redirect URLs for publishable keys (RFC 8252 port-agnostic loopback) */
    redirectUris?: string[];
    /** Enable BYOP app earnings for publishable app keys */
    earningsEnabled?: boolean;
};

export type CreateApiKeyResponse = ApiKey & {
    key: string;
};
