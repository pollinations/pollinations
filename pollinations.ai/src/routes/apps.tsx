import { Button, Surface, TabButton } from "@pollinations/ui";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import {
    type DirectoryApp,
    isBuzz,
    isFresh,
    isPollen,
    useAppDirectory,
} from "../data/publicStats";
import { PageHeader, SectionHeader } from "../ui/site/PageHeader";
import { APP_BADGES, APP_CATEGORIES, validateAppSearch } from "./-app-search";

export const Route = createFileRoute("/apps")({
    validateSearch: validateAppSearch,
    component: AppsPage,
});

/**
 * Hand-picked, deliberately. Every badge in APPS.md is computed from traffic
 * or recency, so none of them can express "we think this is good". Until
 * APPS.md grows a Featured column, curation lives here — matched on the Name
 * column, and missing entries simply don't render.
 */
const SPOTLIGHT = [
    "LLM Playground",
    "Sirius Cybernetics Elevator Challenge",
    "Strudel AI REPL",
    "CatGPT Meme Generator",
    "Convince the CRAZY Idol to let you free",
    "excelformula.pro",
];

const CATEGORY_LABELS: Record<string, string> = {
    all: "All",
    image: "🖼️ Image",
    video_audio: "🎬 Video & Audio",
    writing: "✍️ Write",
    chat: "💬 Chat",
    games: "🎮 Games",
    learn: "📚 Learn",
    bots: "🤖 Bots",
    build: "🛠️ Build",
    business: "💼 Business",
};

const BADGE_LABELS: Record<string, string> = {
    all: "All",
    buzz: "🐝 Busy",
    pollen: "🏵️ Pollen",
    fresh: "🫧 Fresh",
};

function badgesFor(app: DirectoryApp): string {
    const badges: string[] = [];
    if (isBuzz(app)) badges.push("🐝");
    if (isPollen(app)) badges.push("🏵️");
    if (isFresh(app)) badges.push("🫧");
    return badges.join(" ");
}

function AppCard({ app }: { app: DirectoryApp }) {
    const href = app.web_url || app.github_repository_url;
    return (
        <Surface variant="card" className="flex flex-col gap-2 p-5">
            <div className="flex items-start justify-between gap-2">
                <h3 className="font-subheading text-lg text-theme-text-strong">
                    {app.emoji} {app.name}
                </h3>
                <span className="shrink-0 text-sm">{badgesFor(app)}</span>
            </div>
            <p className="text-sm leading-relaxed text-theme-text-base">
                {app.description}
            </p>
            <div className="mt-auto flex flex-wrap items-center gap-2 pt-2 text-xs text-theme-text-muted">
                {app.github_username && <span>by {app.github_username}</span>}
                {app.platform && <span>· {app.platform}</span>}
                {href && (
                    <a
                        href={href}
                        className="ml-auto font-semibold text-theme-text-soft"
                    >
                        Open ↗
                    </a>
                )}
            </div>
        </Surface>
    );
}

function AppsPage() {
    const { category, badge, q } = Route.useSearch();
    const navigate = useNavigate({ from: Route.fullPath });
    const { data: apps, loading, failed } = useAppDirectory();

    const spotlight = useMemo(
        () =>
            SPOTLIGHT.map((name) =>
                apps.find(
                    (app) => app.name.toLowerCase() === name.toLowerCase(),
                ),
            ).filter((app): app is DirectoryApp => app !== undefined),
        [apps],
    );

    const filtered = useMemo(() => {
        const needle = q?.toLowerCase();
        return apps.filter((app) => {
            if (category && app.category !== category) return false;
            if (badge === "buzz" && !isBuzz(app)) return false;
            if (badge === "pollen" && !isPollen(app)) return false;
            if (badge === "fresh" && !isFresh(app)) return false;
            if (
                needle &&
                !`${app.name} ${app.description}`.toLowerCase().includes(needle)
            ) {
                return false;
            }
            return true;
        });
    }, [apps, category, badge, q]);

    return (
        <>
            <PageHeader
                eyebrow={`${loading ? "Apps" : `${apps.length} apps`} built on Pollinations`}
                title="See what people made."
                action={
                    <Button
                        as="a"
                        href="https://github.com/pollinations/pollinations/issues/new?template=APP-SUBMISSION.yml"
                    >
                        Submit your app
                    </Button>
                }
            />

            {spotlight.length > 0 && (
                <section className="flex flex-col gap-5">
                    <SectionHeader
                        eyebrow="Spotlight"
                        title="Worth your time."
                        subtitle={
                            "Picked by hand. Not the busiest \u2014 the ones we\u2019d actually send a friend to."
                        }
                    />
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-4">
                        {spotlight.map((app) => (
                            <AppCard key={app.name} app={app} />
                        ))}
                    </div>
                </section>
            )}

            <section className="flex flex-col gap-5">
                <SectionHeader
                    eyebrow="Browse"
                    title={loading ? "Everything else." : `All ${apps.length}.`}
                    subtitle={
                        "Filter by what you want to make. Badges are automatic \u2014 \ud83d\udc1d busy this week, \ud83c\udff5\ufe0f runs on your Pollen, \ud83e\udee7 new this month."
                    }
                />

                <div className="flex flex-wrap gap-2">
                    {APP_CATEGORIES.map((value) => (
                        <TabButton
                            key={value}
                            size="sm"
                            active={(category ?? "all") === value}
                            onClick={() =>
                                navigate({
                                    search: (prev) => ({
                                        ...prev,
                                        category:
                                            value === "all" ? undefined : value,
                                    }),
                                })
                            }
                        >
                            {CATEGORY_LABELS[value]}
                        </TabButton>
                    ))}
                </div>

                <div className="flex flex-wrap gap-2">
                    {APP_BADGES.map((value) => (
                        <TabButton
                            key={value}
                            size="sm"
                            variant="ghost"
                            active={(badge ?? "all") === value}
                            onClick={() =>
                                navigate({
                                    search: (prev) => ({
                                        ...prev,
                                        badge:
                                            value === "all" ? undefined : value,
                                    }),
                                })
                            }
                        >
                            {BADGE_LABELS[value]}
                        </TabButton>
                    ))}
                </div>

                {failed ? (
                    <p className="text-theme-text-base">
                        The app catalogue could not be loaded. Please try again.
                    </p>
                ) : loading ? (
                    <p className="text-theme-text-muted">Loading apps…</p>
                ) : filtered.length === 0 ? (
                    <p className="text-theme-text-base">
                        No apps match that combination yet.{" "}
                        <button
                            type="button"
                            className="font-semibold text-theme-text-soft underline"
                            onClick={() => navigate({ search: {} })}
                        >
                            Clear filters
                        </button>
                    </p>
                ) : (
                    <>
                        <p className="text-sm text-theme-text-muted">
                            {filtered.length} of {apps.length}
                        </p>
                        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-4">
                            {filtered.slice(0, 60).map((app) => (
                                <AppCard key={app.name} app={app} />
                            ))}
                        </div>
                        {filtered.length > 60 && (
                            <p className="text-sm text-theme-text-muted">
                                Showing the first 60 of {filtered.length}.
                            </p>
                        )}
                    </>
                )}
            </section>
        </>
    );
}
