import {
    PolliProvider,
    useAuthActions,
    useAuthState,
} from "@pollinations/sdk/react";
import { Alert, ContentHeader } from "@pollinations/ui";
import { AppUserMenu } from "@pollinations/ui/app-user-menu/sdk";
import { createFileRoute } from "@tanstack/react-router";
import { type RefObject, useEffect, useRef, useState } from "react";
import { ENTER_URL, POLLI_APP_KEY } from "../config";
import { routeHead } from "../routeMeta";
import { type ConnectDrafts, takeConnectDraft } from "../ui/play/connect-draft";
import { Playground } from "../ui/play/Playground";
import { BottomScene } from "../ui/site/BottomScene";
import { HeroScene, postHeroSpacingClassName } from "../ui/site/HeroScene";
import { validatePlaySearch } from "./-play-search";

export const Route = createFileRoute("/play")({
    head: () => routeHead("/play"),
    validateSearch: validatePlaySearch,
    component: PlayPage,
});

/**
 * The playground (formerly playground.pollinations.ai, which now redirects
 * here). The heading, subtitle and sheet come from the same pattern as /apps
 * and /community so it reads as one site, not an embed.
 *
 * PolliProvider mounts here rather than at the root: route code-splitting
 * keeps @pollinations/sdk inside this chunk, so every other page stays as
 * light as it was before.
 *
 * Color mode belongs to the shared site chrome, so Play inherits the same
 * token-driven light/dark choice as every other route.
 */
function PlayPage() {
    const connect = useRef<(() => void) | null>(null);
    return (
        <PolliProvider
            appKey={POLLI_APP_KEY}
            enterUrl={ENTER_URL}
            permissions={["profile", "usage"]}
        >
            <PlayHero connect={connect} />
            <div className={postHeroSpacingClassName}>
                <HydratedPlayground connect={connect} />
            </div>
            <BottomScene page="play" />
        </PolliProvider>
    );
}

type ConnectProps = { connect: RefObject<(() => void) | null> };

/**
 * The playground reads its inputs from the URL once, on mount. Returning from
 * Connect, the provider first puts back the URL saved before sign-in, so the
 * playground mounts only after that.
 */
function HydratedPlayground({ connect }: ConnectProps) {
    const { isHydrated } = useAuthState();
    const restore = useRef<Promise<ConnectDrafts | undefined> | null>(null);
    const [drafts, setDrafts] = useState<ConnectDrafts>();
    const [restoreError, setRestoreError] = useState(false);
    useEffect(() => {
        if (!isHydrated) return;
        let active = true;
        restore.current ??= takeConnectDraft();
        restore.current.then(
            (saved) => {
                if (active) setDrafts(saved ?? {});
            },
            () => {
                if (active) {
                    setRestoreError(true);
                    setDrafts({});
                }
            },
        );
        return () => {
            active = false;
        };
    }, [isHydrated]);
    return (
        drafts && (
            <>
                {restoreError && (
                    <Alert intent="warning">
                        Couldn’t restore the files saved before sign-in.
                    </Alert>
                )}
                <Playground connectRef={connect} drafts={drafts} />
            </>
        )
    );
}

function PlayHero({ connect }: ConnectProps) {
    const { login } = useAuthActions();
    const { isHydrated } = useAuthState();
    return (
        // The monitor robot, showing off something it just made.
        <HeroScene page="play" compactBottom>
            <ContentHeader
                eyebrow="Models in the browser"
                title="Try it out."
                subtitle="Create images, video and audio with your own balance."
                variant="page"
            />
            <div className="self-start" inert={!isHydrated}>
                <AppUserMenu
                    connectSize="lg"
                    onConnect={() => (connect.current ?? login)()}
                    labels={{ logout: "Disconnect app" }}
                />
            </div>
        </HeroScene>
    );
}
