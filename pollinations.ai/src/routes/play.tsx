import { PolliProvider } from "@pollinations/sdk/react";
import { ContentHeader, useColorMode } from "@pollinations/ui";
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
 * Play controls, including the signed-in profile, use the shared UI treatment.
 */
function AccountAction() {
    return (
        <div className="self-start">
            <AppUserMenu
                dashboardHref={`${ENTER_URL}/keys`}
                triggerVariant="action"
                labels={{
                    authorize: "Connect your account",
                    topUpAccount: "Manage access",
                    logout: "Disconnect",
                }}
            />
        </div>
    );
}

function PlaygroundSky() {
    const { isDark } = useColorMode();

    return (
        <img
            src={
                isDark
                    ? "/heroes/play-controls-night.webp"
                    : "/heroes/play-controls-day.webp"
            }
            alt=""
            aria-hidden="true"
            width={1915}
            height={821}
            loading="lazy"
            decoding="async"
            className="playground-top-scene pointer-events-none absolute inset-x-0 top-0 h-40 w-full select-none object-cover object-top"
        />
    );
}

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
                <HeroScene
                    scene="/heroes/play.webp"
                    nightScene="/heroes/play-top-night.webp"
                    compactBottom
                >
                    <ContentHeader
                        eyebrow="Official models, in the browser"
                        title="Try it out."
                        subtitle={
                            <>
                                Choose an agent for chat, or choose a media mode
                                for direct model controls. Connect and it runs
                                on your own Pollen, through{" "}
                                <strong>
                                    the same endpoints your app will call
                                </strong>
                                .
                            </>
                        }
                        variant="page"
                    />
                    <AccountAction />
                </HeroScene>
            </PageCard>
            <PageCard className="relative isolate pt-6 sm:pt-8">
                <PlaygroundSky />
                <Playground />
                <BottomScene
                    dayScene="/heroes/play-bottom-day.webp"
                    nightScene="/heroes/play-bottom-night.webp"
                />
            </PageCard>
        </PolliProvider>
    );
}
