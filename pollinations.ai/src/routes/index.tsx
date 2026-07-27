import polliBee from "@pollinations/ui/brand/polli/polli.png";
import { createFileRoute } from "@tanstack/react-router";
import { compact, usePlatformStats } from "../data/publicStats";
import { DevKit } from "../ui/home/DevKit";
import { LiveApps } from "../ui/home/LiveApps";
import { MoneyMoves } from "../ui/home/MoneyMoves";
import { OnTheWay } from "../ui/home/OnTheWay";
import { StartBuilding } from "../ui/home/StartBuilding";
import { ThreeWays } from "../ui/home/ThreeWays";
import {
    ActionButton,
    Hero,
    PageHeader,
    PixelRule,
    StatRow,
} from "../ui/site/kit";

export const Route = createFileRoute("/")({
    component: HelloPage,
});

/**
 * Both measured, neither hardcoded. The old row claimed "1.5M daily requests"
 * and "10K weekly active devs" — the first is ~50% high (the real 24h figure
 * is under a million), and the second has no public source at all, so it is
 * gone rather than invented. App count lives on /apps, where the 577 KB
 * directory it needs is the page's actual content.
 */
function useHeroStats() {
    const { data } = usePlatformStats();
    if (!data) return [];
    return [
        { value: compact(data.requestsWeek), label: "requests a week" },
        {
            value: `${data.availability.toFixed(1)}%`,
            label: "availability",
        },
        {
            value: String(data.models),
            label: "models, community included",
        },
    ];
}

function HelloPage() {
    const stats = useHeroStats();

    return (
        <>
            {/* Polli herself opens the site — the one the brand already had. */}
            <Hero character={polliBee}>
                <PageHeader
                    eyebrow="The infrastructure for AI apps"
                    title="Every model, one wallet."
                    subtitle={
                        <>
                            Text, image, audio and video from a single endpoint,
                            with{" "}
                            <strong className="text-theme-text-strong">
                                a Pollen balance behind every call
                            </strong>
                            . Pay as you go, let your users bring their own, or
                            publish a model and earn every time it&rsquo;s
                            called.
                        </>
                    }
                />
                <div className="flex flex-wrap gap-3">
                    <ActionButton href="https://enter.pollinations.ai">
                        Get an API key
                    </ActionButton>
                    <ActionButton
                        href="https://gen.pollinations.ai/docs"
                        tone="plain"
                    >
                        Read the docs
                    </ActionButton>
                </div>
                <StatRow stats={stats} />
            </Hero>

            <ThreeWays />
            <PixelRule />
            <DevKit />
            {/* Dark panel is inset inside the cream sheet, not a sibling of
                it — it reads as a band within the page, not a new section. */}
            <MoneyMoves />
            <LiveApps />
            <OnTheWay />
            <StartBuilding />
        </>
    );
}
