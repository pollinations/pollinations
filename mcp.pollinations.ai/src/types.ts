import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";

export type McpProps = {
    apiKey: string;
    upstreamExpiresIn?: number;
};

export interface Env {
    OAUTH_KV: KVNamespace;
    OAUTH_PROVIDER: OAuthHelpers;
    ENTER_CLIENT_ID: string;
    ENTER_ORIGIN: string;
    GEN_ORIGIN: string;
}
