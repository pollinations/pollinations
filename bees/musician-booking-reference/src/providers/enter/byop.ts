import type {
    BeeAuthorization,
    BeeRequestContext,
} from "../../runtime/index.js";

type UserInfo = {
    sub?: string;
    preferred_username?: string;
    name?: string;
};

export type EnterByopAuthorizerOptions = {
    enterBaseUrl?: string;
    clientId?: string;
    redirectUri?: string;
    scope?: string;
    budget?: number;
    expiryDays?: number;
    fetcher?: typeof fetch;
};

function bearerToken(request: Request): string | undefined {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return undefined;
    return authorization.slice("Bearer ".length).trim();
}

function authorizationUrl(options: RequiredAuthOptions): string {
    const params = new URLSearchParams({
        client_id: options.clientId,
        redirect_uri: options.redirectUri,
        scope: options.scope,
        expiry: String(options.expiryDays),
        budget: String(options.budget),
    });
    return `${options.enterBaseUrl}/authorize?${params.toString()}`;
}

type RequiredAuthOptions = Required<
    Pick<
        EnterByopAuthorizerOptions,
        | "budget"
        | "clientId"
        | "enterBaseUrl"
        | "expiryDays"
        | "redirectUri"
        | "scope"
    >
> & { fetcher: typeof fetch };

function normalizeOptions(
    options: EnterByopAuthorizerOptions,
): RequiredAuthOptions {
    return {
        enterBaseUrl: options.enterBaseUrl ?? "https://enter.pollinations.ai",
        clientId: options.clientId ?? "pk_replace_me",
        redirectUri: options.redirectUri ?? "https://example.test/callback",
        scope: options.scope ?? "usage",
        budget: options.budget ?? 5,
        expiryDays: options.expiryDays ?? 7,
        fetcher: options.fetcher ?? fetch,
    };
}

export function createEnterByopAuthorizer(options: EnterByopAuthorizerOptions) {
    const normalized = normalizeOptions(options);

    return async function authorize(
        context: BeeRequestContext,
    ): Promise<BeeAuthorization> {
        const token = bearerToken(context.request);
        if (!token) {
            return {
                allowed: false,
                status: 402,
                reason: "Bring Your Own Pollen authorization required",
                headers: {
                    "x-pollinations-authorize-url":
                        authorizationUrl(normalized),
                },
            };
        }

        const response = await normalized.fetcher(
            `${normalized.enterBaseUrl}/api/device/userinfo`,
            { headers: { authorization: `Bearer ${token}` } },
        );
        if (!response.ok) {
            return {
                allowed: false,
                status: 403,
                reason: "Invalid or expired Pollinations API key",
            };
        }

        const user = (await response.json()) as UserInfo;
        return {
            allowed: true,
            userId: user.sub ?? user.preferred_username ?? token.slice(0, 12),
        };
    };
}
