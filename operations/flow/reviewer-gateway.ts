import {
    AuthUnavailableError,
    createPollinationsAuth,
} from "@pollinations/auth/server";
import { html } from "hono/html";
import type { FlowOrigins } from "./flow-environment";

const namespace = "flow-reviewer";
export const REVIEWER_AUTH_PATH = `/${namespace}/auth`;

type Config = {
    origins: FlowOrigins;
    clientId: string;
    sessionSecret: string;
    authFetch?: typeof fetch;
    assets: { fetch(request: Request): Promise<Response> };
};

// This is the public boundary. The container receives product fixture traffic,
// never the reviewer's login cookie or production OAuth access token.
export function createReviewerGateway(
    config: Config,
    forward: (reviewerId: string, request: Request) => Promise<Response>,
) {
    const origins = Object.values(config.origins);
    const auth = createPollinationsAuth({
        clientId: config.clientId,
        sessionSecret: config.sessionSecret,
        fetch: config.authFetch,
        access: "authenticated",
        namespace,
        sharedSession: {
            origins: [config.origins.enter, config.origins.admin],
            cookieDomain: new URL(config.origins.enter).hostname,
        },
    });
    const ownsCookie = (value: string) =>
        value.trim().startsWith(`${namespace}_`);

    async function signInPage(request: Request) {
        const url = new URL(request.url);
        const login = new URL(
            `${REVIEWER_AUTH_PATH}/login`,
            config.origins.enter,
        );
        login.searchParams.set(
            "return_to",
            url.origin === config.origins.enter && url.pathname === "/flow"
                ? `${url.pathname}${url.search}`
                : "/flow",
        );
        const page = await config.assets.fetch(
            new Request(new URL(`/${namespace}/index.html`, url)),
        );
        if (!page.ok) return page;
        const loginMeta =
            await html`<meta name="flow-login" content="${login.href}">`;
        return new Response(
            (await page.text()).replace("</head>", `${loginMeta}</head>`),
            {
                headers: {
                    "Content-Type": "text/html; charset=utf-8",
                    "Cache-Control": "private, no-store",
                    "Referrer-Policy": "no-referrer",
                    "Content-Security-Policy": `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; frame-ancestors ${config.origins.enter}; base-uri 'none'; form-action 'none'`,
                },
            },
        );
    }

    return async (request: Request): Promise<Response> => {
        const url = new URL(request.url);
        if (!origins.includes(url.origin))
            return new Response(null, { status: 403 });
        if (
            !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
            !origins.includes(request.headers.get("Origin") ?? "")
        )
            return new Response(null, { status: 403 });

        // Only the gateway's built sign-in assets are public. Product assets
        // still require a reviewer session and belong to its container.
        if (url.pathname.startsWith(`/${namespace}/assets/`))
            return config.assets.fetch(request);

        if (
            url.pathname === `/${namespace}` ||
            url.pathname === `${REVIEWER_AUTH_PATH}/error`
        )
            return signInPage(request);
        try {
            const authResponse = await auth.handle(request);
            if (authResponse) {
                if (
                    url.pathname === `${REVIEWER_AUTH_PATH}/logout` &&
                    authResponse.ok
                ) {
                    const headers = new Headers(authResponse.headers);
                    headers.set(
                        "Location",
                        `${config.origins.enter}/${namespace}`,
                    );
                    return new Response(null, { status: 303, headers });
                }
                return authResponse;
            }
            // The host owns its whole namespace, including unknown routes.
            if (url.pathname.startsWith(`/${namespace}/`))
                return new Response(null, { status: 404 });
            let renewedSession: string | undefined;
            const user = await auth.getUser(request, (value) => {
                renewedSession = value;
            });
            if (!user) {
                if (
                    request.method === "GET" &&
                    (request.headers.get("Sec-Fetch-Mode") === "navigate" ||
                        request.headers.get("Accept")?.includes("text/html"))
                )
                    return signInPage(request);
                return Response.json(
                    { error: "Sign in to Flow to continue." },
                    {
                        status: 401,
                        headers: { "Cache-Control": "private, no-store" },
                    },
                );
            }
            const headers = new Headers(request.headers);
            const cookies = (headers.get("Cookie") ?? "")
                .split(";")
                .filter((value) => value.trim() && !ownsCookie(value))
                .join(";");
            if (cookies) headers.set("Cookie", cookies);
            else headers.delete("Cookie");
            const response = await forward(
                user.sub,
                new Request(request, { headers, redirect: "manual" }),
            );
            if (response.headers.getSetCookie().some(ownsCookie)) {
                await response.body?.cancel();
                return Response.json(
                    {
                        error: "The review environment attempted to change Flow authentication.",
                    },
                    { status: 502 },
                );
            }
            const result = new Response(response.body, response);
            if (renewedSession)
                result.headers.append("Set-Cookie", renewedSession);
            result.headers.set("Cache-Control", "private, no-store");
            result.headers.append(
                "Content-Security-Policy",
                `frame-ancestors ${config.origins.enter}`,
            );
            return result;
        } catch (error) {
            if (error instanceof AuthUnavailableError)
                return error.getResponse();
            throw error;
        }
    };
}
