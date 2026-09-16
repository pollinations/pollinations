import { productPageViewSchema } from "@shared/product-analytics.ts";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { authClient } from "../auth.ts";
import { config } from "../config.ts";

export function Analytics() {
    return import.meta.env.VITE_TINYBIRD_ANALYTICS_ENABLED === "true" ? (
        <SignedInAnalytics />
    ) : null;
}

function SignedInAnalytics() {
    const { data: session, isPending, error } = authClient.useSession();
    const page = useRouterState({
        select: (state) => state.matches.at(-1)?.routeId,
    });
    const lastPage = useRef("");
    const userId = session?.user.id;
    useEffect(() => {
        if (isPending || error || navigator.doNotTrack === "1") return;
        if (!userId) {
            lastPage.current = "";
            return;
        }
        const view = productPageViewSchema.safeParse({ page });
        const key = `${userId}:${page}`;
        if (!view.success || lastPage.current === key) return;
        lastPage.current = key;
        const query = new URLSearchParams(view.data);
        void fetch(`${config.apiBaseUrl}/analytics/page-view?${query}`, {
            method: "POST",
            credentials: "include",
            keepalive: true,
        }).catch(() => {});
    }, [userId, page, isPending, error]);
    return null;
}
