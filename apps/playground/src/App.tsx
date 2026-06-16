import { ColorModeToggle, cn } from "@pollinations/ui";
import {
    AppUserMenu,
    isEmbeddedContext,
} from "@pollinations/ui/app-user-menu/sdk";
import { ENTER_URL } from "./config";
import { Playground } from "./Playground";

export function App() {
    const isEmbedded = isEmbeddedContext();

    return (
        <div
            className={cn(
                "relative flex flex-col bg-app-bg font-body text-theme-text-base",
                !isEmbedded && "min-h-dvh",
            )}
        >
            <div
                className={cn(
                    "fixed right-4 z-40 flex items-center gap-2",
                    isEmbedded ? "top-2" : "top-4",
                )}
            >
                {!isEmbedded && <ColorModeToggle />}
                <AppUserMenu dashboardHref={ENTER_URL} />
            </div>
            <main
                className={cn(
                    "mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 pb-5 sm:px-6",
                    isEmbedded ? "pt-2" : "pt-16",
                )}
            >
                <Playground showTitle={!isEmbedded} />
            </main>
        </div>
    );
}
