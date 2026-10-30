import {
    BookIcon,
    ContentHeader,
    ExternalLinkButton,
    InlineLink,
    LiveDot,
    RocketIcon,
    StatCard,
    Text,
} from "@pollinations/ui";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { requestsSince, useRequestsLastHour } from "../data/publicStats";
import { routeHead } from "../routeMeta";
import { DevKit } from "../ui/home/DevKit";
import { LiveApps } from "../ui/home/LiveApps";
import { MoneyMoves } from "../ui/home/MoneyMoves";
import { StartBuilding } from "../ui/home/StartBuilding";
import { BottomScene } from "../ui/site/BottomScene";
import { HeroScene, postHeroSpacingClassName } from "../ui/site/HeroScene";
import { PolliFlight } from "../ui/site/PolliFlight";

export const Route = createFileRoute("/")({
    head: () => routeHead("/"),
    component: HelloPage,
});

function HelloPage() {
    return (
        <>
            {/* Polli herself opens the site — the one the brand already had. */}
            <HeroScene page="home" wide ambient>
                <ContentHeader
                    eyebrow="Open infrastructure for AI-natives"
                    title="Models. Agents. Tools. One API."
                    subtitle="The AI-native builder community. Generate images, video, speech, music and text. Build agents and apps."
                    variant="page"
                    className="[&_h1]:text-balance sm:[&_h1]:max-w-[18ch]"
                />
                <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                    <ExternalLinkButton
                        href="https://enter.pollinations.ai/keys"
                        intent="brand"
                        size="lg"
                        icon={<RocketIcon className="size-4 shrink-0" />}
                    >
                        Get an API key
                    </ExternalLinkButton>
                    <InlineLink
                        href="https://gen.pollinations.ai/docs#tag/quick-start"
                        className="inline-flex min-h-11 items-center gap-2"
                    >
                        <BookIcon
                            aria-hidden="true"
                            className="size-4 shrink-0"
                        />
                        Quick start
                    </InlineLink>
                </div>
                <RequestsLastHour />
            </HeroScene>

            <DevKit className={postHeroSpacingClassName} />
            <MoneyMoves />
            <LiveApps />
            <StartBuilding />
            <BottomScene page="home" />
            <PolliFlight />
        </>
    );
}

/**
 * Measured traffic as the hero's proof point. The block keeps its height
 * while loading or on failure, and the number counts up once when it lands;
 * screen readers get the final value straight away.
 */
function RequestsLastHour() {
    const { data: requests } = useRequestsLastHour();
    const shown = useCountUp(requests);

    return (
        <div className="flex min-h-[5.5rem] flex-col gap-2">
            {requests ? (
                <StatCard
                    variant="display"
                    value={
                        <>
                            <span aria-hidden="true">
                                {(shown ?? 0).toLocaleString()}
                            </span>
                            <span className="sr-only">
                                {requests.toLocaleString()}
                            </span>
                        </>
                    }
                    label={
                        <>
                            requests in the last hour
                            <LiveDot />
                        </>
                    }
                />
            ) : null}
            {requests ? <SinceArrival perHour={requests} /> : null}
        </div>
    );
}

/**
 * The measured hour's rate, run forward from when the number landed. It is an
 * estimate, so it reads "since you arrived" rather than claiming a count. The
 * number comes last on its line so growing digits move nothing.
 */
function SinceArrival({ perHour }: { perHour: number }) {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        const start = performance.now();
        const reduce = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;
        const timer = setInterval(
            () => setElapsed(performance.now() - start),
            reduce ? 1000 : 250,
        );
        return () => clearInterval(timer);
    }, []);

    return (
        <Text as="div" size="sm" tone="soft" className="leading-tight">
            Since you arrived:{" "}
            <span className="tabular-nums">
                +{requestsSince(elapsed, perHour).toLocaleString()}
            </span>
        </Text>
    );
}

/** Eases from 0 to `target` over ~1s; jumps straight there under reduced motion. */
function useCountUp(target: number | null) {
    const [value, setValue] = useState<number | null>(null);

    useEffect(() => {
        if (target === null) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            setValue(target);
            return;
        }
        const start = performance.now();
        let frame = 0;
        const tick = (now: number) => {
            const progress = Math.min(1, (now - start) / 1000);
            setValue(Math.round(target * (1 - (1 - progress) ** 3)));
            if (progress < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [target]);

    return value;
}
