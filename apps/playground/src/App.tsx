import { ColorModeToggle } from "@pollinations/ui";
import { AppUserMenu } from "@pollinations/ui/app-user-menu/sdk";
import { ENTER_URL } from "./config";
import { Playground } from "./Playground";

export function App() {
    return (
        <div className="relative flex min-h-dvh flex-col bg-app-bg font-body text-theme-text-base">
            <div className="fixed top-4 right-4 z-40 flex items-center gap-2">
                <ColorModeToggle />
                <AppUserMenu dashboardHref={ENTER_URL} />
            </div>
            <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 pt-16 pb-5 sm:px-6">
                <Playground />
            </main>
        </div>
    );
}
