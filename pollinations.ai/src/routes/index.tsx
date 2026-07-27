import { createFileRoute } from "@tanstack/react-router";
import { compact, usePlatformStats } from "../data/publicStats";
import { DevKit } from "../ui/home/DevKit";
import { LiveApps } from "../ui/home/LiveApps";
import { MoneyMoves } from "../ui/home/MoneyMoves";
import { OnTheWay } from "../ui/home/OnTheWay";
import { StartBuilding } from "../ui/home/StartBuilding";
import { ThreeWays } from "../ui/home/ThreeWays";
import { ActionButton, Hero, PageHeader, PixelRule } from "../ui/site/kit";

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
    const { data, loading } = usePlatformStats();
    return [
        {
            value: data ? compact(data.requestsWeek) : "—",
            label: "requests a week",
            loading,
        },
        {
            value: data ? `${data.availability.toFixed(1)}%` : "—",
            label: "availability",
            loading,
        },
        {
            value: data ? String(data.models) : "—",
            label: "models, community included",
            loading,
        },
    ];
}

function HelloPage() {
    const stats = useHeroStats();

    return (
        <>
            <Hero>
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
                <dl className="mt-2 flex flex-wrap gap-10">
                    {stats.map((stat) => (
                        <div key={stat.label} className="flex flex-col">
                            <dt
                                className="font-heading text-4xl text-theme-text-soft tabular-nums"
                                aria-busy={stat.loading}
                            >
                                {stat.value}
                            </dt>
                            <dd className="text-xs text-theme-text-muted">
                                {stat.label}
                            </dd>
                        </div>
                    ))}
                </dl>
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
