import {
    authFlowViewSchema,
    productPageViewSchema,
} from "@shared/product-analytics.ts";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { authClient } from "../auth.ts";
import { config } from "../config.ts";

export function Analytics() {
    return import.meta.env.VITE_TINYBIRD_ANALYTICS_ENABLED === "true" ? (
        <RouteAnalytics />
    ) : null;
}

// Random id that links a signed-out sign-in page view to the server-side
// /sign-in/social and GitHub callback events. It carries no identity and the
// server hooks only read it while it exists; ten minutes covers the redirect.
const AUTH_FLOW_COOKIE = "auth_flow";

function authFlowId(): string {
    const existing = document.cookie
        .split("; ")
        .find((cookie) => cookie.startsWith(`${AUTH_FLOW_COOKIE}=`))
        ?.slice(AUTH_FLOW_COOKIE.length + 1);
    if (existing) return existing;
    const id = crypto.randomUUID();
    const secure = location.protocol === "https:" ? "; Secure" : "";
    // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is missing in Safari and Firefox
    document.cookie = `${AUTH_FLOW_COOKIE}=${id}; Max-Age=600; Path=/; SameSite=Lax${secure}`;
    return id;
}

function beacon(path: string, query: Record<string, string>) {
    void fetch(
        `${config.apiBaseUrl}/analytics/${path}?${new URLSearchParams(query)}`,
        {
            method: "POST",
            credentials: "include",
            keepalive: true,
        },
    ).catch(() => {});
}

function RouteAnalytics() {
    const { data: session, isPending, error } = authClient.useSession();
    const page = useRouterState({
        select: (state) => state.matches.at(-1)?.routeId,
    });
    const lastPage = useRef("");
    const userId = session?.user.id;
    useEffect(() => {
        if (isPending || error || navigator.doNotTrack === "1") return;
        if (!userId) {
            const view = authFlowViewSchema
                .pick({ page: true })
                .safeParse({ page });
            if (!view.success) {
                lastPage.current = "";
                return;
            }
            const flowId = authFlowId();
            const key = `anon:${flowId}:${page}`;
            if (lastPage.current === key) return;
            lastPage.current = key;
            beacon("auth-flow", { ...view.data, flow_id: flowId });
            return;
        }
        const view = productPageViewSchema.safeParse({ page });
        const key = `${userId}:${page}`;
        if (!view.success || lastPage.current === key) return;
        lastPage.current = key;
        beacon("page-view", view.data);
    }, [userId, page, isPending, error]);
    return null;
}
