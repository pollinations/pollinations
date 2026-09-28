import {
    BookIcon,
    ContentHeader,
    ExternalLinkButton,
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
                    eyebrow="Open infrastructure for AI apps"
                    title="Every model, one wallet."
                    subtitle="Build AI apps with models, ready-made agents, and shared infrastructure. Pay for usage with Pollen, our platform credit—buy it or earn it through Quests."
                    variant="page"
                    className="sm:[&_h1]:max-w-[9ch]"
                />
                <div className="flex flex-wrap gap-2 sm:gap-3">
                    <ExternalLinkButton
                        href="https://enter.pollinations.ai/keys"
                        intent="brand"
                        size="lg"
                        icon={<RocketIcon className="size-4 shrink-0" />}
                    >
                        Start for free
                    </ExternalLinkButton>
                    <ExternalLinkButton
                        href="https://gen.pollinations.ai/docs#tag/quick-start"
                        intent="neutral"
                        size="lg"
                        icon={<BookIcon className="size-4 shrink-0" />}
                    >
                        Read the docs
                    </ExternalLinkButton>
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
