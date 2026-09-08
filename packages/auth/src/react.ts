import { useEffect, useState } from "react";
import type { PollinationsUser } from "./server";

export function useDashboardSession() {
    const [session, setSession] = useState<{
        user: PollinationsUser | null;
        isPending: boolean;
        error: string | null;
    }>({ user: null, isPending: true, error: null });

    useEffect(() => {
        const controller = new AbortController();
        const refresh = () =>
            fetch("/auth/session", {
                credentials: "same-origin",
                signal: controller.signal,
            })
                .then(async (response) => {
                    if (!response.ok && response.status !== 401)
                        throw new Error(
                            "Could not check your session. Please reload.",
                        );
                    const { user } = (await response.json()) as {
                        user: PollinationsUser | null;
                    };
                    if (!controller.signal.aborted)
                        setSession({ user, isPending: false, error: null });
                })
                .catch((error) => {
                    if (!controller.signal.aborted)
                        setSession({
                            user: null,
                            isPending: false,
                            error: error.message,
                        });
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
    }, []);

    return session;
}

export function signIn() {
    const url = new URL("/auth/login", window.location.origin);
    const destination = new URL(window.location.href);
    destination.searchParams.delete("auth_error");
    url.searchParams.set(
        "return_to",
        destination.pathname + destination.search,
    );
    window.location.assign(url);
}

export async function signOut() {
    const response = await fetch("/auth/logout", {
        method: "POST",
        credentials: "same-origin",
    });
    if (!response.ok) throw new Error("Could not sign out. Please try again.");
    window.location.assign("/");
}

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
