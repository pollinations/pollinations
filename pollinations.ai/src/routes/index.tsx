import polliBee from "@pollinations/ui/brand/polli/polli.png";
import { createFileRoute } from "@tanstack/react-router";
import { DevKit } from "../ui/home/DevKit";
import { MoneyMoves } from "../ui/home/MoneyMoves";
import { OnTheWay } from "../ui/home/OnTheWay";
import { ThreeWays } from "../ui/home/ThreeWays";

export const Route = createFileRoute("/")({
    component: HelloPage,
});

const STATS = [
    { value: "10K", label: "weekly active devs" },
    { value: "1.5M", label: "daily requests" },
    // /apps counts these live from APPS.md; the hero can't without pulling
    // 288 KB for one number, so it rounds down rather than going stale.
    { value: "800+", label: "live apps" },
] as const;

function HelloPage() {
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
                        <a
                            href="https://enter.pollinations.ai"
                            className="rounded-xl bg-theme-bg-active px-7 py-3 font-semibold text-theme-text-strong"
                        >
                            Get an API key
                        </a>
                        <a
                            href="https://docs.pollinations.ai"
                            className="rounded-xl bg-surface-opaque px-7 py-3 font-semibold text-theme-text-strong"
                        >
                            Read the docs
                        </a>
                    </div>
                    <dl className="mt-2 flex flex-wrap gap-10">
                        {STATS.map((stat) => (
                            <div key={stat.label} className="flex flex-col">
                                <dt className="font-heading text-4xl text-theme-text-soft tabular-nums">
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
