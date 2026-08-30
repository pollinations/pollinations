import { ExternalLinkButton } from "@pollinations/ui";
import { createFileRoute } from "@tanstack/react-router";
import { compact, usePlatformStats } from "../data/publicStats";
import { routeHead } from "../routeMeta";
import { DevKit } from "../ui/home/DevKit";
import { LiveApps } from "../ui/home/LiveApps";
import { MoneyMoves } from "../ui/home/MoneyMoves";
import { OnTheWay } from "../ui/home/OnTheWay";
import { StartBuilding } from "../ui/home/StartBuilding";
import { Hero, PageHeader, StatRow } from "../ui/site/kit";

export const Route = createFileRoute("/")({
    head: () => routeHead("/"),
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
        { value: compact(data.requestsWeek), label: "requests last week" },
        data.availability === null
            ? null
            : {
                  value: `${data.availability.toFixed(1)}%`,
                  label: "official model availability",
              },
        {
            value: String(data.models),
            label: "models",
        },
    ].filter((stat): stat is { value: string; label: string } => stat !== null);
}

function HelloPage() {
    const stats = useHeroStats();

    return (
        <>
            {/* Polli herself opens the site — the one the brand already had. */}
            <Hero scene="/heroes/home.webp">
                <PageHeader
                    eyebrow="Open infrastructure for AI apps"
                    title="Every model, one wallet."
                    subtitle={
                        <>
                            <strong>Start for free</strong> with Pollen earned
                            through Quests. Then build across text, image, audio
                            and video with one API and one wallet.
                        </>
                    }
                />
                <div className="flex flex-wrap gap-3">
                    <ExternalLinkButton
                        href="https://enter.pollinations.ai/quests"
                        appearance="raised"
                    >
                        Start for free
                    </ExternalLinkButton>
                    <ExternalLinkButton
                        href="https://gen.pollinations.ai/docs"
                        appearance="raised"
                        className="bg-surface-opaque"
                    >
                        Read the docs
                    </ExternalLinkButton>
                </div>
                <StatRow stats={stats} />
            </Hero>

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
