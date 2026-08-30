import { PolliProvider } from "@pollinations/sdk/react";
import { ContentHeader, ExternalLinkButton } from "@pollinations/ui";
import { AppUserMenu } from "@pollinations/ui/app-user-menu/sdk";
import { createFileRoute } from "@tanstack/react-router";
import { ENTER_URL, POLLI_APP_KEY } from "../config";
import { routeHead } from "../routeMeta";
import { Playground } from "../ui/play/Playground";
import { HeroScene } from "../ui/site/HeroScene";

export const Route = createFileRoute("/play")({
    head: () => routeHead("/play"),
    component: PlayPage,
});

/**
 * Play controls, including the signed-in profile, use the shared UI treatment.
 */
function SignInAction() {
    return (
        <AppUserMenu
            dashboardHref={`${ENTER_URL}/keys`}
            labels={{
                topUpAccount: "Manage access",
                logout: "Disconnect",
            }}
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
            {/* The monitor robot, showing off something it just made. */}
            <HeroScene scene="/heroes/play.webp">
                <ContentHeader
                    eyebrow="Official models, in the browser"
                    title="Try it out."
                    subtitle={
                        <>
                            Choose an agent for chat, or choose a media mode for
                            direct model controls. Connect and it runs on your
                            own Pollen, through{" "}
                            <strong>
                                the same endpoints your app will call
                            </strong>
                            .
                        </>
                    }
                    variant="page"
                />
                <ExternalLinkButton
                    href={`${ENTER_URL}/keys`}
                    appearance="raised"
                    className="self-start whitespace-nowrap"
                >
                    Get an API key
                </ExternalLinkButton>
            </HeroScene>
            <Playground toolbarAction={<SignInAction />} />
        </PolliProvider>
    );
}
