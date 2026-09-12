import { PolliProvider } from "@pollinations/sdk/react";
import { ContentHeader, useColorMode } from "@pollinations/ui";
import { AppUserMenu } from "@pollinations/ui/app-user-menu/sdk";
import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { ENTER_URL, POLLI_APP_KEY } from "../config";
import { routeHead } from "../routeMeta";
import { Playground } from "../ui/play/Playground";
import { BottomScene } from "../ui/site/BottomScene";
import { HeroScene } from "../ui/site/HeroScene";
import { PageCard } from "../ui/site/PageCard";

const TopUpKeyDemo =
    import.meta.env.DEV || import.meta.env.MODE === "website-v2"
        ? lazy(() => import("../ui/play/TopUpKeyDemo"))
        : null;

export const Route = createFileRoute("/play")({
    head: () => routeHead("/play"),
    component: PlayPage,
});

/**
 * Play controls, including the signed-in profile, use the shared UI treatment.
 */
function AccountAction() {
    const [topUpOpen, setTopUpOpen] = useState(
        () =>
            typeof window !== "undefined" &&
            new URLSearchParams(window.location.search).has("app_top_up"),
    );
    return (
        <div className="self-start">
            <AppUserMenu
                triggerVariant="action"
                onTopUpKey={TopUpKeyDemo ? () => setTopUpOpen(true) : undefined}
                labels={{
                    authorize: "Connect",
                    logout: "Disconnect app",
                }}
            />
            {TopUpKeyDemo && topUpOpen && (
                <Suspense fallback={null}>
                    <TopUpKeyDemo onClose={() => setTopUpOpen(false)} />
                </Suspense>
            )}
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
                        eyebrow="Models and agents, in the browser"
                        title="Try it out."
                        subtitle="Chat with an agent or create images, video and audio. Connect your account to use your own Pollen."
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
