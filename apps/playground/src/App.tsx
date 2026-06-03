import { useAuthState } from "@pollinations/sdk/react";
import type { ThemeName } from "@pollinations/ui";
import { AppHeader } from "@pollinations/ui/compositions/header";
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
            className="flex min-h-dvh flex-col bg-white font-body text-theme-text-base"
        >
            <AppHeader
                dashboardHref={ENTER_URL}
                theme={theme}
                hiddenWhenEmbedded
            />
            <HubReturnRedirect />
            <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-5 sm:px-6">
                <Playground theme={theme} />
            </main>
        </div>
    );
}
