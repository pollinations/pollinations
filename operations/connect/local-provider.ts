import { createHash, randomUUID } from "node:crypto";
import { localIdentity } from "./fixtures";

const origin = "http://localhost:4180";
const callback = `${origin}/api/auth/callback/github`;
const providerToken = "mock_github_auth_token";
const clientId = "test_github_client_id";
const lifetime = 10 * 60_000;
export type SignInOutcome = "normal" | "fail-start" | "fail-next" | "slow";

export function parseOutcome(value: unknown): SignInOutcome {
    if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        Object.keys(value).length !== 1 ||
        !["normal", "fail-start", "fail-next", "slow"].includes(
            (value as { signIn: string }).signIn,
        )
    )
        throw new Error("Choose a local sign-in outcome");
    return (value as { signIn: SignInOutcome }).signIn;
}

export function validateProviderRequest(value: string) {
    const url = new URL(value);
    if (
        url.origin !== "https://github.com" ||
        url.pathname !== "/login/oauth/authorize" ||
        url.searchParams.get("client_id") !== clientId ||
        url.searchParams.get("redirect_uri") !== callback ||
        !url.searchParams.get("state") ||
        (url.searchParams.has("code_challenge") &&
            url.searchParams.get("code_challenge_method") !== "S256")
    )
        throw new Error("Expected the local Enter GitHub request");
    return {
        state: url.searchParams.get("state") as string,
        challenge: url.searchParams.get("code_challenge"),
    };
}

type Authorization = ReturnType<typeof validateProviderRequest> & {
    expiresAt: number;
};

/** Only the external identity provider is simulated; Enter owns authentication. */
export function createLocalProvider() {
    const handoffs = new Map<string, Authorization>();
    const codes = new Map<string, Authorization>();
    let signIn: SignInOutcome = "normal";

    const unavailable = () =>
        Response.json(
            {
                error: "External services are unavailable in this local harness",
            },
            { status: 503 },
        );
    const prune = () => {
        for (const store of [handoffs, codes])
            for (const [id, value] of store)
                if (value.expiresAt < Date.now()) store.delete(id);
    };

    return {
        outcome: () => ({ signIn }),
        setOutcome(value: unknown) {
            signIn = parseOutcome(value);
            return { signIn };
        },
        takeStartFailure() {
            if (signIn !== "fail-start") return false;
            signIn = "normal";
            return true;
        },
        async rewriteSignIn(response: Response) {
            if (!response.ok) return response;
            const body = (await response.clone().json()) as { url?: string };
            if (!body.url) return response;
            const authorization = validateProviderRequest(body.url);
            if (signIn === "slow") {
                signIn = "normal";
                await new Promise((resolve) => setTimeout(resolve, 1500));
            }
            prune();
            const id = randomUUID();
            handoffs.set(id, {
                ...authorization,
                expiresAt: Date.now() + lifetime,
            });
            const url = `${origin}/__connect/identity?id=${id}`;
            const headers = new Headers(response.headers);
            headers.set("Location", url);
            headers.delete("Content-Length");
            return Response.json(
                { ...body, url },
                { status: response.status, headers },
            );
        },
        async handoff(request: Request) {
            prune();
            const id = new URL(request.url).searchParams.get("id") ?? "";
            const authorization = handoffs.get(id);
            if (!authorization)
                return new Response(
                    "Local sign-in expired. Return and try again.",
                    { status: 400 },
                );
            if (request.method === "GET") {
                return new Response(
                    `<!doctype html><html lang="en"><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Local GitHub sign-in</title><style>
:root{color-scheme:light dark;font-family:system-ui}body{margin:0;min-height:100svh;display:grid;place-items:center}main{max-width:28rem;padding:2rem}h1{font-size:1.6rem}p{line-height:1.5;opacity:.75}form{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:1.5rem}button{font:inherit;padding:.75rem 1rem;border:1px solid currentColor;border-radius:.5rem;cursor:pointer}button[value=continue]{font-weight:600}
</style></head><body><main><h1>Local GitHub sign-in</h1>
<p>This uses the local test account. It does not sign in to GitHub or access a real account.</p>
<form method="post"><button name="decision" value="continue">Continue as ${localIdentity.login}</button><button name="decision" value="cancel">Cancel</button></form>
</main></body></html>`,
                    {
                        headers: {
                            "Content-Type": "text/html; charset=utf-8",
                            "Cache-Control": "no-store",
                            "Referrer-Policy": "same-origin",
                            "Content-Security-Policy":
                                "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'self'",
                        },
                    },
                );
            }
            if (request.method !== "POST")
                return new Response("Method not allowed", { status: 405 });
            const decision = new URLSearchParams(await request.text()).get(
                "decision",
            );
            if (decision !== "continue" && decision !== "cancel")
                return new Response("Choose Continue or Cancel", {
                    status: 400,
                });
            handoffs.delete(id);
            const target = new URL(callback);
            target.searchParams.set("state", authorization.state);
            if (decision === "cancel")
                target.searchParams.set("error", "access_denied");
            else {
                const code = randomUUID();
                codes.set(code, authorization);
                target.searchParams.set("code", code);
            }
            return new Response(null, {
                status: 303,
                headers: { Location: target.href, "Cache-Control": "no-store" },
            });
        },
        async outbound(request: Request): Promise<Response> {
            const url = new URL(request.url);
            if (
                url.origin === "https://github.com" &&
                url.pathname === "/login/oauth/access_token" &&
                request.method === "POST"
            ) {
                prune();
                const body = new URLSearchParams(await request.text());
                const code = body.get("code") ?? "";
                const authorization = codes.get(code);
                codes.delete(code);
                if (
                    !authorization ||
                    body.get("client_id") !== clientId ||
                    body.get("redirect_uri") !== callback ||
                    (authorization.challenge &&
                        createHash("sha256")
                            .update(body.get("code_verifier") ?? "")
                            .digest("base64url") !== authorization.challenge)
                ) {
                    return Response.json(
                        { error: "bad_verification_code" },
                        { status: 400 },
                    );
                }
                if (signIn === "fail-next") {
                    signIn = "normal";
                    return unavailable();
                }
                return Response.json({
                    access_token: providerToken,
                    token_type: "bearer",
                    scope: "read:user user:email",
                });
            }
            if (url.origin === "https://api.github.com") {
                if (
                    ![
                        `Bearer ${providerToken}`,
                        `token ${providerToken}`,
                    ].includes(request.headers.get("authorization") ?? "")
                )
                    return Response.json(
                        { message: "Bad credentials" },
                        { status: 401 },
                    );
                if (
                    request.method === "GET" &&
                    ["/user", `/user/${localIdentity.id}`].includes(
                        url.pathname,
                    )
                )
                    return Response.json(localIdentity);
                if (request.method === "GET" && url.pathname === "/user/emails")
                    return Response.json([
                        {
                            email: localIdentity.email,
                            primary: true,
                            verified: true,
                            visibility: "public",
                        },
                    ]);
            }
            return unavailable();
        },
    };
}
