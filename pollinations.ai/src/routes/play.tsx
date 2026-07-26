import { PolliProvider } from "@pollinations/sdk/react";
import { AppUserMenu } from "@pollinations/ui/app-user-menu/sdk";
import { createFileRoute } from "@tanstack/react-router";
import { ENTER_URL, POLLI_APP_KEY } from "../config";
import { Playground } from "../ui/play/Playground";

export const Route = createFileRoute("/play")({
    component: PlayPage,
});

/**
 * The playground, lifted from apps/playground with its UX intact.
 *
 * PolliProvider is mounted here rather than at the root on purpose: route
 * code-splitting keeps @pollinations/sdk inside this chunk, so every other
 * page stays as light — and as SDK-free — as it was before.
 */
function PlayPage() {
    return (
        <PolliProvider
            appKey={POLLI_APP_KEY}
            enterUrl={ENTER_URL}
            permissions={["profile", "usage"]}
        >
            <div className="mx-6 mb-6 overflow-hidden rounded-[28px] bg-theme-bg-pale px-4 py-10 shadow-container sm:px-8 md:px-12">
                {/* The playground's ColorModeToggle is intentionally left
                    out. It sets `.dark` on <html>, which every other page
                    inherits — and the marketing pages aren't designed for
                    dark yet. Restore it when they are. */}
                <div className="mb-6 flex items-center justify-end gap-2">
                    <AppUserMenu dashboardHref={ENTER_URL} />
                </div>
                <Playground />
            </div>
        </PolliProvider>
    );
}
