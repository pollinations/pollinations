import type { ThemeName } from "@pollinations/ui";
import { AppHeader } from "@pollinations/ui/compositions/header";
import { Playground } from "@pollinations/ui/compositions/playground";
import { ENTER_URL } from "./config";

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
            <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-5 sm:px-6">
                <Playground theme={theme} />
            </main>
        </div>
    );
}
