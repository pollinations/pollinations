import { PolliProvider } from "@pollinations/sdk/react";
import { AppUserMenu } from "@pollinations/ui/app-user-menu/sdk";
import { createFileRoute } from "@tanstack/react-router";
import { ENTER_URL, POLLI_APP_KEY } from "../config";
import { Playground } from "../ui/play/Playground";

export const Route = createFileRoute("/play")({
    component: PlayPage,
});

/**
 * The playground, lifted from apps/playground with its UX intact but its own
 * page chrome removed — the heading, subtitle and sheet come from the same
 * pattern as /apps and /community so it reads as one site, not an embed.
 *
 * PolliProvider mounts here rather than at the root: route code-splitting
 * keeps @pollinations/sdk inside this chunk, so every other page stays as
 * light as it was before.
 *
 * The playground's ColorModeToggle is deliberately left out. It sets `.dark`
 * on <html>, which every other page inherits, and the marketing pages aren't
 * designed for dark yet.
 */
function PlayPage() {
    return (
        <PolliProvider
            appKey={POLLI_APP_KEY}
            enterUrl={ENTER_URL}
            permissions={["profile", "usage"]}
        >
            <div className="flex flex-col gap-10 px-8 pt-4 pb-16 md:px-18">
                <header className="flex flex-wrap items-end justify-between gap-5">
                    <div className="flex flex-col gap-2.5">
                        <p className="font-pixel text-sm tracking-widest text-theme-text-soft uppercase">
                            Every model, in the browser
                        </p>
                        <h1 className="font-heading text-5xl text-theme-text-strong">
                            Playground
                        </h1>
                        <p className="max-w-xl text-lg text-theme-text-base">
                            Text, image, audio and video from one workspace.
                            Sign in and it runs on your own Pollen — nothing to
                            install.
                        </p>
                    </div>
                    <AppUserMenu dashboardHref={ENTER_URL} />
                </header>

                <Playground />
            </div>
        </PolliProvider>
    );
}
