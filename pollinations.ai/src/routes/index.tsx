import { Button } from "@pollinations/ui";
import polliBee from "@pollinations/ui/brand/polli/polli.png";
import { createFileRoute } from "@tanstack/react-router";
import { compact, usePlatformStats } from "../data/publicStats";
import { DevKit } from "../ui/home/DevKit";
import { MoneyMoves } from "../ui/home/MoneyMoves";
import { OnTheWay } from "../ui/home/OnTheWay";
import { ThreeWays } from "../ui/home/ThreeWays";

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
        <div className="mx-6 mb-6 overflow-hidden rounded-[28px] bg-theme-bg-pale shadow-container">
            <section className="flex flex-wrap items-center gap-14 px-8 pt-16 pb-14 md:px-18">
                <div className="flex min-w-0 flex-1 flex-col gap-6">
                    <p className="font-pixel text-sm tracking-widest text-theme-text-soft uppercase">
                        The infrastructure for AI apps
                    </p>
                    <h1 className="font-heading text-5xl leading-tight text-theme-text-strong lg:text-7xl">
                        Every model, one wallet.
                    </h1>
                    <p className="max-w-xl text-lg leading-relaxed text-theme-text-base">
                        Text, image, audio and video from a single endpoint,
                        with{" "}
                        <strong className="text-theme-text-strong">
                            a Pollen balance behind every call
                        </strong>
                        . Pay as you go, let your users bring their own, or
                        publish a model and earn every time it&rsquo;s called.
                    </p>
                    <div className="flex flex-wrap gap-3">
                        <Button
                            as="a"
                            href="https://enter.pollinations.ai"
                            size="lg"
                        >
                            Get an API key
                        </Button>
                        <Button
                            as="a"
                            href="https://docs.pollinations.ai"
                            size="lg"
                            className="bg-surface-opaque hover:bg-surface-opaque"
                        >
                            Read the docs
                        </Button>
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
                </div>
                <img
                    src={polliBee}
                    alt=""
                    aria-hidden="true"
                    width={340}
                    height={340}
                    className="mx-auto w-56 shrink-0 lg:w-[340px]"
                />
            </section>

            <ThreeWays />
            <DevKit />
            {/* Dark panel is inset inside the cream sheet, not a sibling of
                it — it reads as a band within the page, not a new section. */}
            <MoneyMoves />
            <OnTheWay />
        </div>
    );
}
