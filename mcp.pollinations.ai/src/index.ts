import { WorkerEntrypoint } from "cloudflare:workers";
import OAuthProvider, { GrantType } from "@cloudflare/workers-oauth-provider";
import { handleMcpRequest } from "./mcp";
import { beginAuthorization, finishAuthorization } from "./oauth";
import type { Env, McpProps } from "./types";

export class McpHandler extends WorkerEntrypoint<Env, McpProps> {
    fetch(request: Request): Promise<Response> {
        return handleMcpRequest(request, this.env, this.ctx.props.apiKey);
    }
}

const defaultHandler: ExportedHandler<Env> = {
    async fetch(request, env) {
        const path = new URL(request.url).pathname;
        try {
            if (path === "/authorize") {
                return await beginAuthorization(request, env);
            }
            if (path === "/oauth/callback") {
                return await finishAuthorization(request, env);
            }
            return new Response("Not found", { status: 404 });
        } catch (error) {
            console.error("OAuth request failed", error);
            return new Response("OAuth request failed", { status: 400 });
        }
    },
};

export default new OAuthProvider<Env>({
    apiRoute: "/mcp",
    apiHandler: McpHandler,
    defaultHandler,
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/token",
    clientRegistrationEndpoint: "/register",
    accessTokenTTL: 7 * 24 * 60 * 60,
    refreshTokenTTL: 0,
    allowPlainPKCE: false,
    clientIdMetadataDocumentEnabled: true,
    tokenExchangeCallback: ({ grantType, props }) => {
        if (
            grantType === GrantType.AUTHORIZATION_CODE &&
            Number.isFinite(props?.upstreamExpiresIn) &&
            props.upstreamExpiresIn > 0
        ) {
            return { accessTokenTTL: props.upstreamExpiresIn };
        }
    },
});
