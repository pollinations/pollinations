import { WorkerEntrypoint } from "cloudflare:workers";
import {
    type ApiKeyAuthResult,
    authenticateApiKeyRequest,
    BannedAccountError,
    StagingAccessDeniedError,
} from "@shared/auth/api-key.ts";
import { handleError } from "@shared/error.ts";
import { requestId } from "@shared/middleware/request-id.ts";
import { getPublicOrigin } from "@shared/public-origin.ts";
import {
    BillableEventBatchSchema,
    BillingAuthorizationSchema,
} from "@shared/schemas/billable-event.ts";
import type { Context } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { api } from "./api.ts";
import type { Env } from "./env.ts";
import { logger } from "./middleware/logger.ts";
import { createDocsRoutes } from "./routes/docs.ts";
import { wellKnownRoutes } from "./routes/well-known.ts";
import {
    authorizeBillingRequest,
    type BillingEventResult,
    cancelBillingAuthorization,
    settleBillableEvents,
} from "./services/billing-service.ts";

function stripTrailingSlash(path: string): string {
    return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function isApiDocsPath(path: string): boolean {
    return path === "/api/docs" || path.startsWith("/api/docs/");
}

function redirectLegacyDocs(c: Context<Env>): Response {
    const reqUrl = new URL(c.req.url);
    const publicOrigin = new URL(getPublicOrigin(c));
    const url = new URL(reqUrl.pathname + reqUrl.search, publicOrigin);
    url.hostname = url.hostname.replace(/(^|\.)enter\./, "$1gen.");
    url.protocol = "https:";
    url.pathname = url.pathname.replace(/^\/api\/docs(?=\/|$)/, "/docs");
    url.pathname = stripTrailingSlash(url.pathname);
    return c.redirect(url.toString(), 301);
}

function getCurrentGenOrigin(c: Context<Env>): string {
    const url = new URL(getPublicOrigin(c));
    url.protocol = "https:";
    url.hostname = url.hostname.replace(/(^|\.)enter\./, "$1gen.");
    return url.origin;
}

const app = new Hono<Env>()
    // Permissive CORS for all API endpoints (all require API keys for auth)
    .use(
        "*",
        cors({
            origin: "*",
            allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            allowHeaders: [], // reflect Access-Control-Request-Headers (permissive; origin already "*")
            exposeHeaders: ["Content-Length", "Content-Disposition"],
            maxAge: 600,
        }),
    )
    .use("*", requestId())
    .use("*", logger)
    // Prevent search engines from indexing API responses (except docs)
    .use("/api/*", async (c, next) => {
        await next();
        if (!isApiDocsPath(c.req.path)) {
            c.header("X-Robots-Tag", "noindex, nofollow");
        }
    })
    .route("/api/docs", createDocsRoutes(api))
    .all("/api/docs", redirectLegacyDocs)
    .all("/api/docs/", redirectLegacyDocs)
    .all("/api/docs/*", redirectLegacyDocs)
    .all("/api/generate/*", (c) => {
        const reqUrl = new URL(c.req.url);
        const publicOrigin = new URL(getPublicOrigin(c));
        const url = new URL(reqUrl.pathname + reqUrl.search, publicOrigin);
        url.hostname = url.hostname.replace(/(^|\.)enter\./, "$1gen.");
        url.protocol = "https:";
        url.pathname = url.pathname.replace(/^\/api\/generate/, "");
        c.header("Deprecation", "true");
        c.header(
            "Link",
            `<${getCurrentGenOrigin(c)}>; rel="successor-version"`,
        );
        return c.redirect(url.toString(), 308);
    })
    .route("/.well-known", wellKnownRoutes)
    .route("/api", api);

app.notFound(async (c: Context<Env>) => {
    return await handleError(new HTTPException(404), c);
});

app.onError(handleError);

export type BillingServiceResponse =
    | { ok: true; events: BillingEventResult[] }
    | {
          ok: false;
          error: "invalid_events" | "invalid_api_key" | "forbidden";
      };

type ServiceTokenResult =
    | {
          ok: true;
          auth: ApiKeyAuthResult & {
              user: NonNullable<ApiKeyAuthResult["user"]>;
          };
      }
    | { ok: false; error: "invalid_api_key" | "forbidden" };

export type BillingAuthorizationResponse =
    | {
          ok: true;
          authorization: {
              userId: string;
              tier: string;
              apiKey: {
                  id: string;
                  permissions: Record<string, string[]> | null;
                  keyType: string | null;
              };
              grant: {
                  id: string;
                  reservedPrice: number;
                  duplicate: boolean;
              };
          };
      }
    | {
          ok: false;
          error:
              | "invalid_authorization"
              | "invalid_api_key"
              | "forbidden"
              | "authorization_conflict"
              | "authorization_closed"
              | "insufficient_balance_or_budget"
              | "model_not_allowed";
      };

async function authenticateServiceToken(
    apiToken: string,
    env: CloudflareBindings,
    ctx: ExecutionContext,
): Promise<ServiceTokenResult> {
    if (typeof apiToken !== "string" || apiToken.length === 0) {
        return { ok: false, error: "invalid_api_key" };
    }

    try {
        const auth = await authenticateApiKeyRequest({
            request: new Request("https://billing.internal", {
                headers: { Authorization: `Bearer ${apiToken}` },
            }),
            env,
            ctx,
        });
        if (!auth?.user) return { ok: false, error: "invalid_api_key" };
        return { ok: true, auth: { ...auth, user: auth.user } };
    } catch (error) {
        if (
            error instanceof BannedAccountError ||
            error instanceof StagingAccessDeniedError
        ) {
            return { ok: false, error: "forbidden" };
        }
        throw error;
    }
}

/** Internal-only billing capability exposed through a named Service Binding. */
export class BillingService extends WorkerEntrypoint<CloudflareBindings> {
    async authorize(
        apiToken: string,
        input: unknown,
    ): Promise<BillingAuthorizationResponse> {
        const authorization = BillingAuthorizationSchema.safeParse(input);
        if (!authorization.success) {
            return { ok: false, error: "invalid_authorization" };
        }
        const result = await authenticateServiceToken(
            apiToken,
            this.env,
            this.ctx,
        );
        if (!result.ok) return result;

        const grant = await authorizeBillingRequest(
            this.env.DB,
            result.auth,
            authorization.data,
        );
        if (!grant.ok) return grant;

        const { apiKey, user } = result.auth;
        return {
            ok: true,
            authorization: {
                userId: user.id,
                tier: user.tier,
                apiKey: {
                    id: apiKey.id,
                    permissions: apiKey.permissions ?? null,
                    keyType:
                        typeof apiKey.metadata?.keyType === "string"
                            ? apiKey.metadata.keyType
                            : null,
                },
                grant: grant.grant,
            },
        };
    }

    async settle(
        authorizationId: string,
        input: unknown,
    ): Promise<BillingServiceResponse> {
        const events = BillableEventBatchSchema.safeParse(input);
        if (!events.success) return { ok: false, error: "invalid_events" };

        return {
            ok: true,
            events: await settleBillableEvents(
                this.env.DB,
                authorizationId,
                events.data,
            ),
        };
    }

    async cancel(authorizationId: string): Promise<{ cancelled: boolean }> {
        return {
            cancelled: await cancelBillingAuthorization(
                this.env.DB,
                authorizationId,
            ),
        };
    }
}

export default {
    fetch: app.fetch,
} satisfies ExportedHandler<CloudflareBindings>;
