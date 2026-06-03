import type { ThemeName } from "@pollinations/ui";
import { AccountMenu } from "@pollinations/ui/compositions/account";
import { Playground } from "@pollinations/ui/compositions/playground";
import { ENTER_URL } from "./config";

const EMBED_QUERY = "embed";

function isEmbedded(): boolean {
    if (typeof window === "undefined") return false;
    const search = new URLSearchParams(window.location.search);
    if (search.get(EMBED_QUERY) === "1") return true;
    return window.self !== window.top;
}

function StandaloneHeader() {
    return (
        <header className="border-b border-theme-border bg-white">
            <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
                <a
                    href="https://pollinations.ai"
                    className="font-heading text-xl text-theme-text-strong"
                >
                    Playground
                </a>
                <AccountMenu dashboardHref={ENTER_URL} />
            </div>
        </header>
    );
}

export function App() {
    const embedded = isEmbedded();
    const theme: ThemeName = "violet";

    return (
        <div
            data-theme={theme}
            className="flex min-h-dvh flex-col bg-white font-body text-theme-text-base"
        >
            {!embedded && <StandaloneHeader />}
            <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-5 sm:px-6">
                <Playground theme={theme} />
            </main>
        </div>
    );
}
