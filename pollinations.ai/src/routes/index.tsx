import { Button, ExternalLinkButton, Section, Surface } from "@pollinations/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
    CTA,
    HELLO_META,
    HERO,
    ROADMAP,
    STATS,
    type StatLiveKey,
    TOOLBOX,
} from "../components/hello/copy.ts";
import { ToolboxCard } from "../components/hello/ToolboxCard.tsx";
import { loadApps } from "../lib/apps.ts";

const PUBLIC_MODEL_STATS_URL =
    "https://api.europe-west2.gcp.tinybird.co/v0/pipes/public_model_stats.json?token=p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICI5ZWZmMGM3Ni1kOTZkLTQwYjgtYWQwOC1mNDFlMmRiYjBmYTIiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.6VnVkAQ5h_fkcDZVDUoU38dzTxaw0xo3DnmKkhECbA8&limit=200";
const MODEL_STATS_DAYS = 7;

export const Route = createFileRoute("/")({
    head: () => ({
        meta: [
            { title: HELLO_META.title },
            { name: "description", content: HELLO_META.description },
        ],
    }),
    component: HelloPage,
});

type LiveStatValues = Partial<Record<StatLiveKey, string>>;

function formatStatCount(count: number): string {
    return new Intl.NumberFormat("en", {
        maximumFractionDigits: 1,
        notation: "compact",
    }).format(count);
}

async function fetchAverageDailyRequests(signal: AbortSignal): Promise<number> {
    const res = await fetch(PUBLIC_MODEL_STATS_URL, { signal });
    if (!res.ok) throw new Error("Daily requests unavailable");

    const data = (await res.json()) as {
        data?: Array<{ request_count?: unknown }>;
    };
    const requests = (data.data ?? []).reduce((sum, row) => {
        return (
            sum +
            (typeof row.request_count === "number" ? row.request_count : 0)
        );
    }, 0);

    return Math.round(requests / MODEL_STATS_DAYS);
}

function useLiveStats(): LiveStatValues {
    const [liveStats, setLiveStats] = useState<LiveStatValues>({});

    useEffect(() => {
        const controller = new AbortController();

        async function loadStats() {
            const [dailyRequests, liveApps] = await Promise.allSettled([
                fetchAverageDailyRequests(controller.signal),
                loadApps(),
            ]);

            if (controller.signal.aborted) return;

            const nextStats: LiveStatValues = {};
            if (dailyRequests.status === "fulfilled") {
                nextStats.dailyRequests = formatStatCount(dailyRequests.value);
            }
            if (liveApps.status === "fulfilled") {
                nextStats.liveApps = formatStatCount(liveApps.value.length);
            }
            setLiveStats(nextStats);
        }

        void loadStats();

        return () => controller.abort();
    }, []);

    return liveStats;
}

function HelloPage() {
    const liveStats = useLiveStats();

    return (
        <div className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-10 sm:px-6">
            {/* Hero */}
            <section className="flex flex-col gap-5">
                <h1 className="font-heading text-4xl leading-none text-theme-text-strong sm:text-5xl">
                    {HERO.title}
                </h1>
                <p className="max-w-2xl font-body text-lg text-theme-text-base">
                    {HERO.bodyPrefix}
                    <strong className="font-semibold text-theme-text-strong">
                        {HERO.bodyBold}
                    </strong>
                    {HERO.bodySuffix}
                </p>
                <div className="flex flex-wrap gap-3">
                    {HERO.ctas.map((c) => (
                        <ExternalLinkButton key={c.label} href={c.href}>
                            {c.label}
                        </ExternalLinkButton>
                    ))}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-theme-text-soft">
                    {STATS.map((s, i) => {
                        const value = s.liveKey
                            ? (liveStats[s.liveKey] ?? s.value)
                            : s.value;

                        return (
                            <span
                                key={s.label}
                                className="flex items-center gap-2"
                            >
                                {i > 0 && (
                                    <span className="text-theme-text-muted">
                                        ·
                                    </span>
                                )}
                                <strong className="font-subheading text-base text-theme-text-strong">
                                    {value}
                                </strong>
                                {s.label}
                            </span>
                        );
                    })}
                </div>
            </section>

            {/* Dev kit */}
            <Section title="Dev kit" framed>
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    {TOOLBOX.map((item) => (
                        <ToolboxCard key={item.title} item={item} />
                    ))}
                </div>
            </Section>

            {/* Next */}
            <Section title="Next" framed>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {ROADMAP.map((r) => {
                        const Icon = r.icon;

                        return (
                            <Surface
                                key={r.title}
                                variant="card"
                                className="rounded-lg bg-surface-white p-4 transition-colors hover:bg-surface-white"
                            >
                                <div className="flex items-center gap-2">
                                    <span
                                        aria-hidden="true"
                                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-theme-bg-active text-theme-text-strong"
                                    >
                                        <Icon className="h-4 w-4" />
                                    </span>
                                    <h3 className="font-subheading text-base text-theme-text-strong">
                                        {r.title}
                                    </h3>
                                </div>
                                <p className="mt-1 text-sm text-theme-text-soft">
                                    {r.description}
                                </p>
                            </Surface>
                        );
                    })}
                </div>
            </Section>

            {/* CTA */}
            <section className="flex flex-col gap-4 border-t border-theme-border pt-8">
                <h2 className="font-subheading text-2xl text-theme-text-strong">
                    {CTA.title}
                </h2>
                <p className="max-w-2xl text-theme-text-base">{CTA.body}</p>
                <div className="flex flex-wrap gap-3">
                    <ExternalLinkButton href={CTA.registerHref}>
                        Register
                    </ExternalLinkButton>
                    <Button as={Link} to="/community">
                        Community
                    </Button>
                    <ExternalLinkButton href={CTA.docsHref}>
                        Read the Docs
                    </ExternalLinkButton>
                </div>
            </section>
        </div>
    );
}
