import { PolliProvider } from "@pollinations/sdk/react";
import { ContentHeader } from "@pollinations/ui";
import { AppUserMenu } from "@pollinations/ui/app-user-menu/sdk";
import { createFileRoute } from "@tanstack/react-router";
import { ENTER_URL, POLLI_APP_KEY } from "../config";
import { routeHead } from "../routeMeta";
import { Playground } from "../ui/play/Playground";
import { BottomScene } from "../ui/site/BottomScene";
import { HeroScene } from "../ui/site/HeroScene";
import { PageCard } from "../ui/site/PageCard";

export const Route = createFileRoute("/play")({
    head: () => routeHead("/play"),
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
 * Color mode belongs to the shared site chrome, so Play inherits the same
 * token-driven light/dark choice as every other route.
 */
function PlayPage() {
    return (
        <PolliProvider
            appKey={POLLI_APP_KEY}
            enterUrl={ENTER_URL}
            permissions={["profile", "usage"]}
        >
            <PageCard className="pb-0 sm:pb-0">
                {/* The monitor robot, showing off something it just made. */}
                <HeroScene page="play" compactBottom>
                    <ContentHeader
                        eyebrow="Models and agents, in the browser"
                        title="Try it out."
                        subtitle="Chat with an agent or create images, video and audio. Connect your account to use your own Pollen."
                        variant="page"
                    />
                    <div className="self-start">
                        <AppUserMenu
                            connectSize="lg"
                            labels={{ logout: "Disconnect app" }}
                        />
                    </div>
                </HeroScene>
            </PageCard>
            <PageCard className="pt-6 sm:pt-8">
                <Playground />
                <BottomScene page="play" />
            </PageCard>
        </PolliProvider>
    );
}
