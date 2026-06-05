import { cn, type ThemeName } from "@pollinations/ui";
import {
    AppUserMenu,
    isEmbeddedContext,
} from "@pollinations/ui/app-user-menu/sdk";
import { ENTER_URL } from "./config";
import { Playground } from "./Playground";

export function App() {
    const theme: ThemeName = "violet";
    const isEmbedded = isEmbeddedContext();

    return (
        <div
            data-theme={theme}
            className="relative flex min-h-dvh flex-col bg-surface-opaque font-body text-theme-text-base"
        >
            <div className="fixed top-4 right-4 z-40">
                <AppUserMenu dashboardHref={ENTER_URL} hiddenWhenEmbedded />
            </div>
            <main
                className={cn(
                    "mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 pb-5 sm:px-6",
                    isEmbedded ? "pt-5" : "pt-16",
                )}
            >
                <Playground theme={theme} />
            </main>
        </div>
    );
}
