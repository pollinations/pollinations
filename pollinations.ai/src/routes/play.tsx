import {
    PolliProvider,
    useAuthActions,
    useAuthState,
} from "@pollinations/sdk/react";
import { ContentHeader, InlineLink } from "@pollinations/ui";
import { AppUserMenu } from "@pollinations/ui/app-user-menu/sdk";
import { createFileRoute } from "@tanstack/react-router";
import { ENTER_URL, POLLI_APP_KEY } from "../config";
import { routeHead } from "../routeMeta";
import { Playground } from "../ui/play/Playground";
import { ENTER_SOURCE_PARAMS } from "../ui/site/Analytics";
import { BottomScene } from "../ui/site/BottomScene";
import { HeroScene, postHeroSpacingClassName } from "../ui/site/HeroScene";
import { validatePlaySearch } from "./-play-search";

export const Route = createFileRoute("/play")({
    head: () => routeHead("/play"),
    validateSearch: validatePlaySearch,
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
            authorizeParams={ENTER_SOURCE_PARAMS}
            permissions={["profile", "usage"]}
        >
            <PlayHero />
            <div className={postHeroSpacingClassName}>
                <Playground />
            </div>
            <BottomScene page="play" />
        </PolliProvider>
    );
}

/**
 * Before connecting, the sentence itself connects (the playground's Generate
 * button does too); once connected, the account menu shows below it.
 */
function PlayHero() {
    const { isLoggedIn, isHydrated } = useAuthState();
    const { login } = useAuthActions();
    const connect =
        isHydrated && !isLoggedIn ? (
            // Connecting leaves for enter, so it carries the external arrow.
            // Wrapped: login() takes an optional request, not the click event.
            <InlineLink
                as="button"
                type="button"
                external
                onClick={() => login()}
            >
                Connect your account
            </InlineLink>
        ) : (
            "Connect your account"
        );

    return (
        // The monitor robot, showing off something it just made.
        <HeroScene page="play" compactBottom>
            <ContentHeader
                eyebrow="Models in the browser"
                title="Try it out."
                subtitle={
                    <>
                        Create images, video and audio. {connect} to use your
                        own pollen.
                    </>
                }
                variant="page"
            />
            {isLoggedIn && (
                <div className="self-start">
                    <AppUserMenu labels={{ logout: "Disconnect app" }} />
                </div>
            )}
        </HeroScene>
    );
}
