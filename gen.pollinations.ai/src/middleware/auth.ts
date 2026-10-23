import type { AgentRunClaims } from "@shared/auth/agent-run-token.ts";
import {
    type AuthenticatedApiKey,
    type AuthUser,
    authenticateApiKeyRequest,
    BannedAccountError,
    StagingAccessDeniedError,
} from "@shared/auth/api-key.ts";
import type { CommunityEndpointRuntime } from "@shared/community-endpoints.ts";
import {
    isModelCategory,
    keyAllowsModel,
} from "@shared/registry/model-permissions.ts";
import type { ModelDefinition } from "@shared/registry/registry.ts";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { appOrigin, permissionRequired } from "../utils/refusals.ts";
import type { LoggerVariables } from "./logger.ts";

type ModelVariables = {
    model: {
        requested: string;
        resolved: string;
        definition: Pick<ModelDefinition, "category" | "aliases">;
        communityEndpoint?: CommunityEndpointRuntime;
        endpoint?: string;
    };
};

export type AuthVariables = {
    auth: {
        user?: AuthUser;
        apiKey?: AuthenticatedApiKey;
        requireUser: () => AuthUser;
        requireModelAccess: () => void;
        agentRun?: AgentRunClaims;
        /** Where links that fix a refusal send the owner back to. */
        appOrigin?: string;
    };
};

export type GenerationAuthSnapshot = {
    user: Pick<AuthUser, "id" | "tier">;
    apiKey?: Omit<AuthenticatedApiKey, "rawKey">;
    agentRun?: AgentRunClaims;
};

export type AuthEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & AuthVariables & Partial<ModelVariables>;
};

const AUTHENTICATION_REQUIRED_MESSAGE =
    "A valid API key is required. Get one at https://enter.pollinations.ai/keys, or buy one with USDC (x402) at https://enter.pollinations.ai/api/x402/keys";

function installAuth(
    c: Context<AuthEnv>,
    authResult: {
        user?: AuthUser;
        apiKey?: AuthenticatedApiKey;
        agentRun?: AgentRunClaims;
    },
): void {
    const { user, apiKey, agentRun } = authResult;

    const requireUser = (): AuthUser => {
        if (!user) {
            throw new HTTPException(401, {
                message: AUTHENTICATION_REQUIRED_MESSAGE,
            });
        }
        return user;
    };

    function requireModelAccess(): void {
        const model = c.var.model;
        if (!model) return;

        if (!apiKey) return;

        const models = apiKey.permissions?.models;
        if (
            !keyAllowsModel(
                models,
                model.resolved,
                model.definition,
                model.endpoint,
            )
        ) {
            // A key limited to specific models asks for this one model; a key
            // limited to categories asks for the model's category.
            const grant = models?.some((value) => !isModelCategory(value))
                ? { model: model.resolved }
                : { category: model.definition.category };
            const allowed = models?.length
                ? `is limited to ${models.join(", ")}`
                : "allows no models";
            throw permissionRequired(
                c,
                grant,
                `Model '${model.requested}' is not allowed for this API key, which ${allowed}.`,
            );
        }
    }

    c.set("auth", {
        user,
        apiKey,
        requireUser,
        requireModelAccess,
        ...(agentRun && { agentRun }),
        appOrigin: appOrigin(apiKey, c.req.header("referer")),
    });
}

export const auth = () =>
    createMiddleware<AuthEnv>(async (c, next) => {
        let authResult: Awaited<ReturnType<typeof authenticateApiKeyRequest>>;
        try {
            authResult = await authenticateApiKeyRequest({
                request: c.req.raw,
                env: c.env,
                ctx: c.executionCtx,
            });
        } catch (error) {
            if (
                error instanceof BannedAccountError ||
                error instanceof StagingAccessDeniedError
            ) {
                throw new HTTPException(403, {
                    message: error.message,
                });
            }
            throw error;
        }
        installAuth(c, authResult || {});
        await next();
    });

export const authFromSnapshot = (snapshot: GenerationAuthSnapshot) =>
    createMiddleware<AuthEnv>(async (c, next) => {
        installAuth(c, {
            user: snapshot.user as AuthUser,
            apiKey: snapshot.apiKey as AuthenticatedApiKey | undefined,
            agentRun: snapshot.agentRun,
        });
        await next();
    });
