import { useAuthState } from "@pollinations/sdk/react";
import type { ThemeName } from "@pollinations/ui";
import { AppUserMenu } from "@pollinations/ui/compositions/app-user";
import { Playground } from "@pollinations/ui/compositions/playground";
import { useEffect } from "react";
import { ENTER_URL } from "./config";

function hubReturnUrl(): string | null {
    if (typeof window === "undefined") return null;
    const rawReturn = new URLSearchParams(window.location.search).get(
        "hubReturn",
    );
    if (!rawReturn) return null;

    const target = new URL(rawReturn, window.location.origin);
    return target.origin === window.location.origin ? target.toString() : null;
}

function HubReturnRedirect() {
    const { isHydrated, isLoggedIn, error } = useAuthState();

    useEffect(() => {
        if (!isHydrated || (!isLoggedIn && !error)) return;
        const target = hubReturnUrl();
        if (target) window.location.replace(target);
    }, [isHydrated, isLoggedIn, error]);

    return null;
}

export function App() {
    const theme: ThemeName = "violet";

    return (
        <div
            data-theme={theme}
            className="relative flex min-h-dvh flex-col bg-white font-body text-theme-text-base"
        >
            <HubReturnRedirect />
            <div className="fixed top-4 right-4 z-40">
                <AppUserMenu dashboardHref={ENTER_URL} />
            </div>
            <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 pt-16 pb-5 sm:px-6">
                <Playground theme={theme} />
            </main>
        </div>
    );
}
