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
        const messages: Record<string, string> = {
            cancelled: "Sign-in was cancelled. You can try again.",
            invalid_state: "Your sign-in link expired. Please try again.",
            access_denied:
                "Your account could not sign in to Flow. Please try again.",
            unavailable:
                "Pollinations sign-in is temporarily unavailable. Please try again.",
        };
        const message =
            url.pathname === `${REVIEWER_AUTH_PATH}/error`
                ? messages[url.searchParams.get("auth_error") ?? ""]
                : undefined;
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
        return new Response(
            await html`<!doctype html><html lang="en"><head>
            <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
            <meta name="color-scheme" content="light dark"><title>Pollinations Flow</title>
            <style>body{font:1rem/1.5 system-ui,sans-serif;max-width:36rem;margin:12vh auto;padding:1.5rem}a{display:inline-block;padding:.75rem 0}</style>
            </head><body><main><h1>Pollinations Flow</h1>
            <p>Review product journeys in your own disposable environment. Screens use fixture data.</p>
            ${message ? html`<p role="alert">${message}</p>` : ""}
            <a href="${login.href}" target="_top">Sign in with Pollinations</a>
            </main></body></html>`,
            {
                headers: {
                    "Content-Type": "text/html; charset=utf-8",
                    "Cache-Control": "private, no-store",
                    "Referrer-Policy": "no-referrer",
                    "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; frame-ancestors ${config.origins.enter}`,
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
