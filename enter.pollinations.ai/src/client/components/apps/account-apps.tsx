export type AccountApp = {
    emoji: string;
    name: string;
    webUrl?: string | null;
    description?: string | null;
    language?: string | null;
    category?: string | null;
    platform?: string | null;
    githubUsername?: string | null;
    githubUserId?: string | null;
    repoUrl?: string | null;
    repoStars?: string | null;
    discordUsername?: string | null;
    other?: string | null;
    submittedDate?: string | null;
    issueUrl?: string | null;
    approvedDate?: string | null;
    byop?: string | boolean | null;
    requests24h?: string | number | null;
};

type AccountAppsProps = {
    apps: AccountApp[];
    githubUsername: string;
};

const CATEGORY_STYLES: Record<
    string,
    { card: string; chip: string; label: string }
> = {
    image: {
        card: "bg-violet-100 border-violet-200",
        chip: "border-violet-500 text-violet-900",
        label: "IMAGE",
    },
    video_audio: {
        card: "bg-green-100  border-green-200",
        chip: "border-green-600  text-green-900",
        label: "AUDIO/VIDEO",
    },
    games: {
        card: "bg-red-100    border-red-200",
        chip: "border-red-500    text-red-900",
        label: "GAMES",
    },
    build: {
        card: "bg-blue-100   border-blue-200",
        chip: "border-blue-500   text-blue-900",
        label: "BUILD",
    },
    learn: {
        card: "bg-amber-100  border-amber-200",
        chip: "border-amber-600  text-amber-900",
        label: "LEARN",
    },
    writing: {
        card: "bg-rose-100   border-rose-200",
        chip: "border-rose-500   text-rose-900",
        label: "WRITING",
    },
    business: {
        card: "bg-teal-100   border-teal-200",
        chip: "border-teal-600   text-teal-900",
        label: "BUSINESS",
    },
    chat: {
        card: "bg-indigo-100 border-indigo-200",
        chip: "border-indigo-500 text-indigo-900",
        label: "CHAT",
    },
    bots: {
        card: "bg-orange-100 border-orange-200",
        chip: "border-orange-500 text-orange-900",
        label: "BOTS",
    },
};

const DEFAULT_STYLE = {
    card: "bg-stone-50 border-stone-200",
    chip: "border-stone-400 text-stone-900",
    label: "APP",
};

function getCategoryStyle(category?: string | null) {
    return CATEGORY_STYLES[(category || "").toLowerCase()] ?? DEFAULT_STYLE;
}

function compactUrl(value?: string | null): string | null {
    if (!value) return null;
    try {
        return new URL(value).host.replace(/^www\./, "");
    } catch {
        return value;
    }
}

function formatListedDate(date?: string | null): string | null {
    if (!date) return null;
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function AccountApps({
    apps,
}: AccountAppsProps): React.ReactElement | null {
    if (apps.length === 0) return null;

    const publishUrl =
        "https://github.com/pollinations/pollinations/issues/new?template=tier-app-submission.yml";

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="font-heading text-4xl text-green-950 sm:text-5xl">
                        Your Apps
                    </h2>
                    <p className="mt-1 text-sm text-stone-600">
                        Panels tint with each app's primary modality.
                    </p>
                </div>
                <a
                    href={publishUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 rounded-full bg-green-950 px-5 py-3 text-sm font-semibold text-green-50 transition-colors hover:bg-green-800"
                >
                    + Publish an app
                </a>
            </div>

            <div className="flex flex-col gap-2">
                {apps.map((app) => {
                    const style = getCategoryStyle(app.category);
                    const webHost = compactUrl(app.webUrl);
                    const listedDate = formatListedDate(
                        app.approvedDate || app.submittedDate,
                    );

                    return (
                        <a
                            key={`${app.name}:${app.githubUserId ?? ""}`}
                            href={
                                app.webUrl ||
                                app.repoUrl ||
                                app.issueUrl ||
                                undefined
                            }
                            target="_blank"
                            rel="noreferrer"
                            className={`flex items-center gap-5 rounded-2xl border px-5 py-5 transition-opacity hover:opacity-90 ${style.card}`}
                        >
                            {/* Icon */}
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-3xl shadow-sm">
                                {app.emoji}
                            </div>

                            {/* Main content */}
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-baseline gap-x-2">
                                    <span className="font-subheading text-xl font-semibold leading-tight text-stone-950">
                                        {app.name}
                                    </span>
                                    {webHost && (
                                        <span className="text-sm text-stone-500">
                                            {webHost}
                                        </span>
                                    )}
                                    {listedDate && (
                                        <span className="text-sm text-stone-400">
                                            · Listed {listedDate}
                                        </span>
                                    )}
                                </div>
                                {app.description && (
                                    <p className="mt-1 truncate text-sm text-stone-600">
                                        {app.description}
                                    </p>
                                )}
                            </div>

                            {/* Category chip */}
                            {app.category && (
                                <span
                                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold tracking-wide ${style.chip}`}
                                >
                                    {getCategoryStyle(app.category).label}
                                </span>
                            )}
                        </a>
                    );
                })}
            </div>
        </div>
    );
}
