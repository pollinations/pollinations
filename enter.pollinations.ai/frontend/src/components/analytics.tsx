import { productPageViewSchema } from "@shared/product-analytics.ts";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { authClient } from "../auth.ts";
import { config } from "../config.ts";

export function Analytics() {
    return import.meta.env.VITE_TINYBIRD_ANALYTICS_ENABLED === "true" ? (
        <PageViews />
    ) : null;
}

// Random per-tab id plus where the tab came from, captured at the first
// document load and repeated on every view. sessionStorage survives the
// GitHub redirect in the same tab, so a tab whose views go from signed out to
// signed in is a completed sign-in — no cookie and no server hook needed.
function tabAttribution(): Record<string, string> {
    try {
        const stored = sessionStorage.getItem("analytics_tab");
        if (stored) return JSON.parse(stored);
    } catch {}
    const tab: Record<string, string> = { flow_id: crypto.randomUUID() };
    try {
        const host = new URL(document.referrer).hostname;
        if (host && host !== location.hostname) tab.referrer_host = host;
    } catch {}
    const params = new URLSearchParams(location.search);
    for (const key of ["utm_source", "utm_medium", "utm_campaign"]) {
        const value =
            params.get(key) ??
            (key === "utm_source" ? params.get("ref") : null);
        if (value) tab[key] = value.slice(0, 100);
    }
    try {
        sessionStorage.setItem("analytics_tab", JSON.stringify(tab));
    } catch {}
    return tab;
}

function PageViews() {
    const { data: session, isPending, error } = authClient.useSession();
    const page = useRouterState({
        select: (state) => state.matches.at(-1)?.routeId,
    });
    const lastPage = useRef("");
    const userId = session?.user.id;
    useEffect(() => {
        if (
            isPending ||
            error ||
            navigator.doNotTrack === "1" ||
            (navigator as { globalPrivacyControl?: boolean })
                .globalPrivacyControl
        )
            return;
        const params = new URLSearchParams(location.search);
        const view = productPageViewSchema.safeParse({
            page,
            ...tabAttribution(),
            client_id: (
                params.get("client_id") ??
                params.get("app_key") ??
                undefined
            )?.slice(0, 100),
        });
        const key = `${userId ?? ""}:${page}`;
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
