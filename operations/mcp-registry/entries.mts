/**
 * Registry entries for the hosted MCP servers.
 *
 * The official MCP registry (registry.modelcontextprotocol.io) lists remote
 * servers through a `server.json` file. The servers we host are declared once,
 * in `shared/registry/mcp.ts`, so the entries are derived from that file: a
 * server added there reaches the registry on the next publish without anyone
 * writing another entry by hand.
 */

import {
    MCP_SERVERS,
    type McpServerDefinition,
} from "../../shared/registry/mcp.ts";

/** One endpoint per server id on the MCP gateway. */
export const MCP_GATEWAY_BASE_URL = "https://gen.pollinations.ai/mcp";

/** Where users create the API key every hosted server requires. */
export const API_KEY_URL = "https://enter.pollinations.ai/keys";

/** Setup documentation linked from every entry. */
export const SETUP_DOCS_URL =
    "https://gen.pollinations.ai/docs#tag/mcp-servers";

/** Namespace GitHub OIDC publishing from this repository grants. */
export const REGISTRY_NAMESPACE = "io.github.pollinations";

export const REGISTRY_SCHEMA_URL =
    "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";

export const REPOSITORY_URL = "https://github.com/pollinations/pollinations";

/** The registry expects remote servers to live in the publishing repository. */
export const REPOSITORY_SUBFOLDER = "apps/mcp";

/** Used when no version is passed to the generator. */
export const DEFAULT_VERSION = "1.0.0";

/** The registry schema caps `description` at 100 characters. */
export const MAX_DESCRIPTION_LENGTH = 100;

/** Header the gateway authenticates with. */
export const API_KEY_HEADER = "Authorization";

/** Reverse-DNS key the registry reserves for publisher metadata. */
export const PUBLISHER_META_KEY =
    "io.modelcontextprotocol.registry/publisher-provided";

/**
 * Listing fields the registry schema cannot take straight from
 * `shared/registry/mcp.ts`: the schema caps `description` at 100 characters, and
 * one server description is longer because it is written for the dashboard.
 */
const LISTING_OVERRIDES: Record<
    string,
    { title?: string; description?: string }
> = {
    pollinations: {
        title: "Pollinations MCP",
    },
    composio: {
        description:
            "Read Gmail, search GitHub, update Sheets, and post to Slack from your own connected accounts.",
    },
};

export type McpRegistryHeader = {
    name: string;
    description: string;
    isRequired: boolean;
    isSecret: boolean;
};

export type McpRegistryRemote = {
    type: "streamable-http";
    url: string;
    headers: McpRegistryHeader[];
};

export type McpRegistryEntry = {
    $schema: string;
    name: string;
    title: string;
    description: string;
    version: string;
    websiteUrl: string;
    repository: {
        url: string;
        source: "github";
        subfolder: string;
    };
    remotes: McpRegistryRemote[];
    _meta?: Record<string, unknown>;
};

export type RegistryEntryOptions = {
    version?: string;
    /** Commit the entries were generated from; adds publisher metadata. */
    commit?: string;
    /** ISO timestamp for the publisher metadata; defaults to now. */
    generatedAt?: string;
};

export function registryServerName(id: string): string {
    return `${REGISTRY_NAMESPACE}/${id}`;
}

export function mcpGatewayUrl(id: string): string {
    return `${MCP_GATEWAY_BASE_URL}/${id}`;
}

export function listingTitle(server: McpServerDefinition): string {
    return (
        LISTING_OVERRIDES[server.id]?.title ??
        `${server.name} (via Pollinations)`
    );
}

export function listingDescription(server: McpServerDefinition): string {
    return LISTING_OVERRIDES[server.id]?.description ?? server.description;
}

/**
 * Tells MCP clients to send the API key and where to get one. The listing
 * description is capped at 100 characters, so the key instructions live here.
 */
export function apiKeyHeader(): McpRegistryHeader {
    return {
        name: API_KEY_HEADER,
        description: `Pollinations API key sent as "Bearer <key>". Create one at ${API_KEY_URL}.`,
        isRequired: true,
        isSecret: true,
    };
}

export function toRegistryEntry(
    server: McpServerDefinition,
    options: RegistryEntryOptions = {},
): McpRegistryEntry {
    const version = options.version ?? DEFAULT_VERSION;
    if (!version) {
        throw new Error(`${server.id}: the registry requires a version`);
    }

    const description = listingDescription(server);
    if (!description) {
        throw new Error(`${server.id}: the registry requires a description`);
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
        throw new Error(
            `${server.id}: description is ${description.length} characters, the registry accepts ${MAX_DESCRIPTION_LENGTH}`,
        );
    }

    const entry: McpRegistryEntry = {
        $schema: REGISTRY_SCHEMA_URL,
        name: registryServerName(server.id),
        title: listingTitle(server),
        description,
        version,
        websiteUrl: SETUP_DOCS_URL,
        repository: {
            url: REPOSITORY_URL,
            source: "github",
            subfolder: REPOSITORY_SUBFOLDER,
        },
        remotes: [
            {
                type: "streamable-http",
                url: mcpGatewayUrl(server.id),
                headers: [apiKeyHeader()],
            },
        ],
    };

    if (options.commit) {
        entry._meta = {
            [PUBLISHER_META_KEY]: {
                source: REPOSITORY_URL,
                commit: options.commit,
                generatedAt: options.generatedAt ?? new Date().toISOString(),
            },
        };
    }

    return entry;
}

/** Every entry we publish, in the order the servers are declared. */
export function buildRegistryEntries(
    options: RegistryEntryOptions = {},
): McpRegistryEntry[] {
    return MCP_SERVERS.map((server) => toRegistryEntry(server, options));
}
