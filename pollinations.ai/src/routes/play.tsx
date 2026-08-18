import {
    PolliProvider,
    useAuthActions,
    useAuthState,
} from "@pollinations/sdk/react";
import { ButtonGroup, TabButton } from "@pollinations/ui";
import { AppUserMenu } from "@pollinations/ui/app-user-menu/sdk";
import { createFileRoute } from "@tanstack/react-router";
import { ENTER_URL, POLLI_APP_KEY } from "../config";
import { Chat } from "../ui/play/Chat";
import { Playground } from "../ui/play/Playground";
import { ActionButton, Hero, PageHeader } from "../ui/site/kit";

type PlaySearch = {
    view?: "playground";
};

export const Route = createFileRoute("/play")({
    validateSearch: (search: Record<string, unknown>): PlaySearch =>
        search.view === "playground" ? { view: "playground" } : {},
    component: PlayPage,
});

/**
 * Connect, in the hero CTA row like every other page's primary action, and in
 * the site's button style rather than the dashboard pill AppUserMenu ships —
 * the playground lives on the marketing site now, so its actions speak the
 * site's language. Once signed in the slot becomes the account menu, which
 * stays a pill because it's an account chip, not an action.
 */
function ConnectAction() {
    const { isLoggedIn, isHydrated } = useAuthState();
    const { login } = useAuthActions();
    if (!isHydrated) {
        return (
            <ActionButton as="button" disabled aria-label="Loading account">
                Checking…
            </ActionButton>
        );
    }
    return isLoggedIn ? (
        <AppUserMenu dashboardHref={ENTER_URL} />
    ) : (
        <ActionButton as="button" onClick={() => login()}>
            Connect
        </ActionButton>
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
 * The playground's ColorModeToggle is deliberately left out. It sets `.dark`
 * on <html>, which every other page inherits, and the marketing pages aren't
 * designed for dark yet.
 */
function PlayPage() {
    const { view } = Route.useSearch();
    const navigate = Route.useNavigate();
    const activeView = view === "playground" ? "playground" : "chat";

    return (
        <PolliProvider
            appKey={POLLI_APP_KEY}
            enterUrl={ENTER_URL}
            permissions={["profile", "usage"]}
        >
            {/* The monitor robot, showing off something it just made. */}
            <Hero scene="/heroes/play.webp">
                <PageHeader
                    eyebrow="Official models, in the browser"
                    title="Try it out."
                    subtitle={
                        <>
                            Chat naturally and let Floret route the work, or
                            open the Playground for direct model controls. Sign
                            in and it runs on your own Pollen, through{" "}
                            <strong>
                                the same endpoints your app will call
                            </strong>
                            .
                        </>
                    }
                />
                <div className="flex flex-wrap gap-3">
                    <ConnectAction />
                </div>
            </Hero>
            <ButtonGroup role="tablist" aria-label="Play modes">
                <TabButton
                    id="play-chat-tab"
                    role="tab"
                    active={activeView === "chat"}
                    aria-selected={activeView === "chat"}
                    aria-controls="play-chat-panel"
                    onClick={() =>
                        navigate({ search: {}, replace: true })
                    }
                >
                    Chat
                </TabButton>
                <TabButton
                    id="play-playground-tab"
                    role="tab"
                    active={activeView === "playground"}
                    aria-selected={activeView === "playground"}
                    aria-controls="play-playground-panel"
                    onClick={() =>
                        navigate({
                            search: { view: "playground" },
                            replace: true,
                        })
                    }
                >
                    Playground
                </TabButton>
            </ButtonGroup>
            {activeView === "chat" ? (
                <div
                    id="play-chat-panel"
                    role="tabpanel"
                    aria-labelledby="play-chat-tab"
                >
                    <Chat />
                </div>
            ) : (
                <div
                    id="play-playground-panel"
                    role="tabpanel"
                    aria-labelledby="play-playground-tab"
                >
                    <Playground />
                </div>
            )}
        </PolliProvider>
    );
}
