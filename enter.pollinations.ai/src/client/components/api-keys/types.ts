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
}

export interface ApiKeyUpdateParams {
    name?: string;
    allowedModels?: string[] | null;
    pollenBudget?: number | null;
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
    /** Days until expiry. null = no expiry */
    expiryDays?: number | null;
    /** Account permissions: ["profile", "usage", "keys"]. null = no permissions */
    accountPermissions?: string[] | null;
    /** App URL for publishable keys (legacy single-URL field; prefer `redirectUris`) */
    appUrl?: string;
    /** Allowed OAuth redirect URIs for publishable keys (RFC 8252 port-agnostic loopback) */
    redirectUris?: string[];
};

export type CreateApiKeyResponse = ApiKey & {
    key: string;
};
