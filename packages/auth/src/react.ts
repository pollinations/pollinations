import { useEffect, useState } from "react";
import type { PollinationsUser } from "./server";

export type DashboardAuthRuntime = {
    fetch: typeof fetch;
    location: () => URL;
    navigate: (url: string) => void;
};

const browserRuntime: DashboardAuthRuntime = {
    fetch: (input, init) => fetch(input, init),
    location: () => new URL(window.location.href),
    navigate: (url) => window.location.assign(url),
};

export function useDashboardSession(runtime = browserRuntime) {
    const [session, setSession] = useState<{
        user: PollinationsUser | null;
        isPending: boolean;
        error: string | null;
    }>({ user: null, isPending: true, error: null });

    useEffect(() => {
        const controller = new AbortController();
        // Start authentication on arrival, but never restart a canceled,
        // failed or explicitly signed-out flow on a focus refresh.
        const params = runtime.location().searchParams;
        let redirectOnArrival =
            !params.has("auth_error") && params.get("signed_out") !== "1";
        const refresh = () =>
            runtime
                .fetch("/auth/session", {
                    credentials: "same-origin",
                    signal: controller.signal,
                })
                .then(async (response) => {
                    if (!response.ok && response.status !== 401)
                        throw new Error(
                            "Could not check your session. Please try again.",
                        );
                    const { user } = (await response.json()) as {
                        user: PollinationsUser | null;
                    };
                    if (controller.signal.aborted) return;
                    const startAuthentication = !user && redirectOnArrival;
                    redirectOnArrival = false;
                    if (startAuthentication) {
                        createDashboardActions(runtime).signIn();
                        return;
                    }
                    setSession({ user, isPending: false, error: null });
                })
                .catch((error) => {
                    redirectOnArrival = false;
                    if (!controller.signal.aborted)
                        setSession((previous) =>
                            previous.user
                                ? previous
                                : {
                                      user: null,
                                      isPending: false,
                                      error: error.message,
                                  },
                        );
                });
        const expired = () =>
            setSession({ user: null, isPending: false, error: null });
        window.addEventListener("pollinations:session-expired", expired);
        window.addEventListener("focus", refresh);
        const interval = window.setInterval(refresh, 60_000);
        void refresh();
        return () => {
            controller.abort();
            window.removeEventListener("pollinations:session-expired", expired);
            window.removeEventListener("focus", refresh);
            window.clearInterval(interval);
        };
    }, [runtime]);

    return session;
}

export function createDashboardActions(runtime: DashboardAuthRuntime) {
    return {
        signIn() {
            const destination = new URL(runtime.location());
            const url = new URL("/auth/login", destination.origin);
            destination.searchParams.delete("auth_error");
            destination.searchParams.delete("signed_out");
            url.searchParams.set(
                "return_to",
                destination.pathname + destination.search,
            );
            runtime.navigate(url.href);
        },
        async signOut() {
            const response = await runtime.fetch("/auth/logout", {
                method: "POST",
                credentials: "same-origin",
            });
            if (!response.ok)
                throw new Error("Could not sign out. Please try again.");
            runtime.navigate("/?signed_out=1");
        },
    };
}

export const { signIn, signOut } = createDashboardActions(browserRuntime);

export async function dashboardFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
) {
    const response = await fetch(input, {
        ...init,
        credentials: "same-origin",
    });
    if (response.status === 401) {
        window.dispatchEvent(new Event("pollinations:session-expired"));
        throw new Error(
            "Your dashboard session expired. Please sign in again.",
        );
    }
    return response;
}
