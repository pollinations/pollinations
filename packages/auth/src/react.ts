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
        return () => controller.abort();
    }, []);

    return session;
}

export function signIn() {
    const url = new URL("/auth/login", window.location.origin);
    url.searchParams.set(
        "return_to",
        window.location.pathname + window.location.search,
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
