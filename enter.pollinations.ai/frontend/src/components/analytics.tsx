import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { authClient } from "../auth.ts";
import { analyticsEnabled, posthog } from "../lib/posthog.ts";

export function Analytics() {
    return analyticsEnabled ? <SignedInAnalytics /> : null;
}

function SignedInAnalytics() {
    const { data: session, isPending, error } = authClient.useSession();
    // Route templates, not URLs: OAuth queries, key IDs and fragments stay local.
    const page = useRouterState({
        select: (state) => state.matches.at(-1)?.routeId,
    });
    const lastPage = useRef("");
    const userId = session?.user.id;
    useEffect(() => {
        if (isPending || error) return;
        if (!userId) {
            posthog.reset();
            lastPage.current = "";
            return;
        }
        if (posthog.get_distinct_id() !== userId) {
            posthog.reset();
            posthog.identify(userId);
        }
        const key = `${userId}:${page}`;
        if (page && lastPage.current !== key) {
            posthog.capture("page_viewed", { page });
            lastPage.current = key;
        }
    }, [userId, page, isPending, error]);
    return null;
}
