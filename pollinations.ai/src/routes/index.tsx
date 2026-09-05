import {
    BookIcon,
    ContentHeader,
    ExternalLinkButton,
    RocketIcon,
} from "@pollinations/ui";
import { createFileRoute } from "@tanstack/react-router";
import { compact, usePlatformStats } from "../data/publicStats";
import { routeHead } from "../routeMeta";
import { DevKit } from "../ui/home/DevKit";
import { HeroStats } from "../ui/home/HeroStats";
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

function useHeroStats() {
    const { data } = usePlatformStats();
    if (!data) return [];
    return [
        { value: compact(data.requestsWeek), label: "requests last week" },
        { value: String(data.models - data.agents), label: "models" },
        { value: String(data.agents), label: "agents" },
        data.mcpServers === null
            ? null
            : { value: String(data.mcpServers), label: "MCP servers" },
        data.availability === null
            ? null
            : {
                  value: `${data.availability.toFixed(1)}%`,
                  label: "official model availability",
              },
    ].filter((stat): stat is { value: string; label: string } => stat !== null);
}

function HelloPage() {
    const stats = useHeroStats();

    return (
        <>
            {/* Polli herself opens the site — the one the brand already had. */}
            <HeroScene
                scene="/heroes/home.webp"
                nightScene="/heroes/home-top-night.webp"
                contentClassName="px-6 pt-20 sm:max-w-[90%] lg:max-w-[72%]"
            >
                <ContentHeader
                    eyebrow="Open infrastructure for AI apps"
                    title="Every model, one wallet."
                    subtitle="Complete small Quests to earn Pollen—the platform credit, where 1 Pollen = $1. Use it across text, image, audio and video through one API, then publish what you build and earn more when people use it."
                    variant="page"
                    className="sm:[&_h1]:max-w-[9ch]"
                />
                <div className="flex flex-wrap gap-2 sm:gap-3">
                    <ExternalLinkButton
                        href="https://enter.pollinations.ai/quests"
                        appearance="raised"
                        icon={<RocketIcon className="size-4 shrink-0" />}
                        className="max-sm:px-4! max-sm:py-2! max-sm:text-sm!"
                    >
                        Start for free
                    </ExternalLinkButton>
                    <ExternalLinkButton
                        href="https://gen.pollinations.ai/docs"
                        appearance="raised"
                        icon={<BookIcon className="size-4 shrink-0" />}
                        className="bg-surface-opaque max-sm:px-4! max-sm:py-2! max-sm:text-sm!"
                    >
                        Read the docs
                    </ExternalLinkButton>
                </div>
                <HeroStats stats={stats} />
            </HeroScene>

            <DevKit className={postHeroSpacingClassName} />
            {/* Dark panel is inset inside the cream sheet, not a sibling of
                it — it reads as a band within the page, not a new section. */}
            <MoneyMoves />
            <LiveApps />
            <OnTheWay />
            <StartBuilding />
            <BottomScene
                dayScene="/heroes/home-bottom-day.webp"
                nightScene="/heroes/home-bottom-night.webp"
            />
        </>
    );
}
