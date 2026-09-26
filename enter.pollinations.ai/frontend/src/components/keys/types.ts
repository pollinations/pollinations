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
    pollenBudgetTier?: number | null;
    pollenBudgetPaid?: number | null;
    allowPaidOnly?: boolean;
    byopClientKeyId?: string | null;
}

export interface ApiKeyUpdateParams {
    name?: string;
    allowedModels?: string[] | null;
    pollenBudget?: number | null;
    pollenBudgetTier?: number | null;
    pollenBudgetPaid?: number | null;
    allowPaidOnly?: boolean;
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
    allowedModels?: string[] | null;
    /** Pollen budget cap for this key. null = unlimited */
    pollenBudget?: number | null;
    /** Quest/tier budget cap. null = no separate tier cap */
    pollenBudgetTier?: number | null;
    /** Paid/pack budget cap. null = no separate paid cap */
    pollenBudgetPaid?: number | null;
    /** Allow paid-only models on this key */
    allowPaidOnly?: boolean;
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
