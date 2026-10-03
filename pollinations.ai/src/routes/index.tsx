import {
    BookIcon,
    ContentHeader,
    ExternalLinkButton,
    InlineLink,
    RocketIcon,
    Text,
    UsageIcon,
} from "@pollinations/ui";
import { createFileRoute } from "@tanstack/react-router";
import { useRequestsLastHour } from "../data/publicStats";
import { routeHead } from "../routeMeta";
import { DevKit } from "../ui/home/DevKit";
import { LiveApps } from "../ui/home/LiveApps";
import { MoneyMoves } from "../ui/home/MoneyMoves";
import { StartBuilding } from "../ui/home/StartBuilding";
import { BottomScene } from "../ui/site/BottomScene";
import { HeroScene, postHeroSpacingClassName } from "../ui/site/HeroScene";

export const Route = createFileRoute("/")({
    head: () => routeHead("/"),
    component: HelloPage,
});

function HelloPage() {
    return (
        <>
            {/* Polli herself opens the site — the one the brand already had. */}
            <HeroScene
                page="home"
                contentClassName="sm:max-w-[90%] sm:pt-20 lg:max-w-[72%]"
            >
                <ContentHeader
                    eyebrow="Open infrastructure for AI-natives"
                    title="Models. Agents. Tools. One API."
                    subtitle="The AI-native builder community. Generate images, videos, speech, music and text. Build agents and apps."
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
        </>
    );
}

/** Measured traffic; the line keeps its height while loading or on failure. */
function RequestsLastHour() {
    const { data: requests } = useRequestsLastHour();

    return (
        <Text
            size="sm"
            tone="muted"
            className="flex min-h-5 items-center gap-2 tabular-nums"
        >
            {requests ? (
                <>
                    <UsageIcon aria-hidden="true" className="size-4 shrink-0" />
                    <span>
                        <Text
                            as="strong"
                            size="sm"
                            tone="strong"
                            weight="semibold"
                        >
                            {requests.toLocaleString()}
                        </Text>{" "}
                        requests in the last hour
                    </span>
                </>
            ) : null}
        </Text>
    );
}
