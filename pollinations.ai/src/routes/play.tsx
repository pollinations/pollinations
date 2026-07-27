import { PolliProvider } from "@pollinations/sdk/react";
import { AppUserMenu } from "@pollinations/ui/app-user-menu/sdk";
import { createFileRoute } from "@tanstack/react-router";
import { ENTER_URL, POLLI_APP_KEY } from "../config";
import { Playground } from "../ui/play/Playground";
import { Hero, HeroCharacter, PageHeader } from "../ui/site/kit";

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
            {/* The monitor robot, showing off something it just made. */}
            <Hero aside={<HeroCharacter src="/characters/play.png" />}>
                <PageHeader
                    eyebrow="Every model, in the browser"
                    title="Try it out."
                    subtitle="Try any model here before you write a line of code. Sign in and it runs on your own Pollen — nothing to install, and the same endpoints your app will call."
                    action={<AppUserMenu dashboardHref={ENTER_URL} />}
                />
            </Hero>
            <Playground />
        </PolliProvider>
    );
}
