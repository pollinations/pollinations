import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

// Enter records the site's page views: pollinations.ai → enter.pollinations.ai,
// staging.pollinations.ai → staging.enter.pollinations.ai. Other hosts
// (localhost, previews) send nothing.
const ENTER_ORIGIN = location.hostname.endsWith("pollinations.ai")
    ? `https://${location.hostname.replace(/pollinations\.ai$/, "enter.pollinations.ai")}`
    : "";

// Where the visit came from, as on Enter's dashboard: read at module load,
// before /play and /apps rewrite the search params, and kept in
// sessionStorage for full reloads within the tab. No identifier is stored: no
// cookie, no random id.
const SOURCE = ((): Record<string, string> => {
    try {
        const stored = sessionStorage.getItem("analytics_source");
        if (stored) return JSON.parse(stored);
    } catch {}
    const source: Record<string, string> = {};
    try {
        const host = new URL(document.referrer).hostname;
        if (host && host !== location.hostname) source.referrer_host = host;
    } catch {}
    const params = new URLSearchParams(location.search);
    for (const key of ["utm_source", "utm_medium", "utm_campaign"]) {
        const value =
            params.get(key) ??
            (key === "utm_source" ? params.get("ref") : null);
        if (value) source[key] = value.slice(0, 100);
    }
    try {
        sessionStorage.setItem("analytics_source", JSON.stringify(source));
    } catch {}
    return source;
})();

// The visit's source as Enter reads it from its landing URL, carried on links
// to Enter and on Play's sign-in, so a signup or purchase there is credited to
// where the visitor came from rather than to pollinations.ai. An organic
// referrer travels as utm_source because the hop replaces document.referrer
// with this site.
const { referrer_host, ...tags } = SOURCE;
export const ENTER_SOURCE_PARAMS: Record<string, string> = referrer_host
    ? { utm_source: referrer_host, ...tags }
    : tags;

function tagEnterLink(event: Event) {
    const link = (event.target as Element).closest?.<HTMLAnchorElement>(
        "a[href]",
    );
    if (!link?.hostname?.endsWith("enter.pollinations.ai")) return;
    const url = new URL(link.href);
    for (const [key, value] of Object.entries(ENTER_SOURCE_PARAMS))
        if (!url.searchParams.has(key)) url.searchParams.set(key, value);
    link.href = url.href;
}

export function Analytics() {
    const page = useRouterState({ select: (state) => state.location.pathname });

    useEffect(() => {
        // click covers keyboard activation, auxclick the middle button,
        // contextmenu "open in new tab".
        const events = ["click", "auxclick", "contextmenu"];
        for (const type of events)
            document.addEventListener(type, tagEnterLink, true);
        return () => {
            for (const type of events)
                document.removeEventListener(type, tagEnterLink, true);
        };
    }, []);

    useEffect(() => {
        if (!ENTER_ORIGIN) return;
        // sendBeacon carries Enter's session cookie (same site), so a
        // signed-in visitor's view is linked to their account as on Enter.
        // Unknown paths are rejected by Enter's page list.
        const query = new URLSearchParams({ page, ...SOURCE });
        navigator.sendBeacon(
            `${ENTER_ORIGIN}/api/analytics/website-page-view?${query}`,
        );
    }, [page]);

    return null;
}
