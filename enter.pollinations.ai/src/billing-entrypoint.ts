import { WorkerEntrypoint } from "cloudflare:workers";
import {
    type ApiKeyAuthResult,
    authenticateApiKeyRequest,
    BannedAccountError,
    StagingAccessDeniedError,
} from "@shared/auth/api-key.ts";
import {
    BillableEventBatchSchema,
    type BillingAuthorizationResponse,
    BillingAuthorizationSchema,
    type BillingIdentity,
    type BillingIntrospectionResponse,
    type BillingServiceBinding,
    type BillingSettlementResponse,
} from "@shared/schemas/billable-event.ts";
import {
    authorizeBillingRequest,
    cancelBillingAuthorization,
    settleBillableEvents,
    writeBillingTelemetry,
} from "./services/billing-service.ts";

type AuthenticatedServiceToken = ApiKeyAuthResult & {
    user: NonNullable<ApiKeyAuthResult["user"]>;
};

async function authenticateServiceToken(
    apiToken: string,
    env: CloudflareBindings,
    ctx: ExecutionContext,
): Promise<
    | { ok: true; auth: AuthenticatedServiceToken }
    | { ok: false; error: "invalid_api_key" | "forbidden" }
> {
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

function identityFromAuth(
    auth: AuthenticatedServiceToken,
    balances = {
        tier: auth.user.tierBalance ?? 0,
        pack: auth.user.packBalance ?? 0,
        apiKey: auth.apiKey.pollenBalance ?? null,
    },
): BillingIdentity {
    const metadata = auth.apiKey.metadata ?? {};
    const clientId = auth.apiKey.byopClientKeyId ?? null;
    return {
        userId: auth.user.id,
        tier: auth.user.tier,
        agentRun: auth.agentRun,
        balances,
        apiKey: {
            id: auth.apiKey.id,
            name: auth.apiKey.name ?? null,
            permissions: auth.apiKey.permissions ?? null,
            keyType:
                typeof metadata.keyType === "string" ? metadata.keyType : null,
            clientId,
            createdVia: clientId
                ? "redirect-auth"
                : typeof metadata.createdVia === "string"
                  ? metadata.createdVia
                  : null,
            clientName: auth.apiKey.byopClientName ?? null,
            clientUserId: auth.apiKey.byopClientUserId ?? null,
        },
    };
}

/** Internal billing authority exposed through a named Service Binding. */
export class BillingService
    extends WorkerEntrypoint<CloudflareBindings>
    implements BillingServiceBinding
{
    async introspect(apiToken: string): Promise<BillingIntrospectionResponse> {
        const result = await authenticateServiceToken(
            apiToken,
            this.env,
            this.ctx,
        );
        if (!result.ok) return result;
        return { ok: true, identity: identityFromAuth(result.auth) };
    }

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

        const authorized = await authorizeBillingRequest(
            this.env.DB,
            result.auth,
            authorization.data,
        );
        if (!authorized.ok) return authorized;
        const { balances, ...grant } = authorized.grant;
        return {
            ok: true,
            identity: identityFromAuth(result.auth, balances),
            grant,
        };
    }

    async settle(
        authorizationId: string,
        input: unknown,
    ): Promise<BillingSettlementResponse> {
        const events = BillableEventBatchSchema.safeParse(input);
        if (!events.success) return { ok: false, error: "invalid_events" };
        const settled = await settleBillableEvents(
            this.env.DB,
            authorizationId,
            events.data,
        );
        await writeBillingTelemetry(this.env, authorizationId, settled);
        return {
            ok: true,
            events: settled,
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
