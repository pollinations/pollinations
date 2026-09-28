import {
    BookIcon,
    ContentHeader,
    ExternalLinkButton,
    InlineLink,
    RocketIcon,
} from "@pollinations/ui";
import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../routeMeta";
import { DevKit } from "../ui/home/DevKit";
import { LiveApps } from "../ui/home/LiveApps";
import { MoneyMoves } from "../ui/home/MoneyMoves";
import { OnTheWay } from "../ui/home/OnTheWay";
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
                    eyebrow="Open infrastructure for AI builders"
                    title="Models. Agents. Tools. One wallet."
                    subtitle="One API for official and community models, agents and hosted tools. Pay with Pollen credits, or let users bring theirs. Publish your own models and agents; earn from your models and apps."
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
            </HeroScene>

            <DevKit className={postHeroSpacingClassName} />
            {/* Dark panel is inset inside the cream sheet, not a sibling of
                it — it reads as a band within the page, not a new section. */}
            <MoneyMoves />
            <LiveApps />
            <OnTheWay />
            <StartBuilding />
            <BottomScene page="home" />
        </>
    );
}
