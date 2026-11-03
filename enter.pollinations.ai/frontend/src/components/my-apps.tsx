import {
    Button,
    Chip,
    formatCount,
    GitHubIcon,
    ImageIcon,
    InlineLink,
    PulseIcon,
    Section,
    Surface,
    Text,
} from "@pollinations/ui";
import {
    type AppCategory,
    type AppPlatform,
    CATEGORY_LABELS,
    PLATFORM_LABELS,
} from "../../../../shared/app-catalog.ts";
import type { ListedApp } from "../backend-types.ts";
import { CardLoading, LoadError } from "./layout/dashboard-loading.tsx";

/** The submission form every listed app started as (issue template). */
/** The public catalog every listing here appears in. */
const APP_CATALOG_URL = "https://pollinations.ai/apps";

const SUBMIT_APP_URL =
    "https://github.com/pollinations/pollinations/issues/new?template=app-submission.yml";

function formatDate(value: string | null): string | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
    });
}

/** A listing's submission issue number. */
function issueNumber(url: string | null): string | null {
    return url?.match(/\/issues\/(\d+)/)?.[1] ?? null;
}

function IssueIcon() {
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="mr-1 inline h-3.5 w-3.5 align-[-0.125em]"
        >
            <circle cx={12} cy={12} r={9} />
            <circle cx={12} cy={12} r={1} fill="currentColor" stroke="none" />
        </svg>
    );
}

/**
 * Screenshots are 16:9 or the older 2:1. A 2:1 frame filled from the top
 * shows 2:1 ones whole and trims only the bottom of 16:9 ones, never the
 * sides where logos and headlines sit.
 */
function Screenshot({ src }: { src: string | null }) {
    return (
        <div className="relative aspect-[2/1] overflow-hidden bg-theme-bg-subtle">
            {src ? (
                <img
                    src={src}
                    alt=""
                    loading="lazy"
                    width={1280}
                    height={720}
                    className="absolute inset-0 h-full w-full object-cover object-top"
                />
            ) : (
                <ImageIcon className="absolute inset-0 m-auto h-6 w-6 text-theme-text-muted" />
            )}
        </div>
    );
}

/** One card per listing; the grid gives every card the tallest one's height. */
function AppCard({ app }: { app: ListedApp }) {
    const approved = formatDate(app.approvedDate);
    const issue = issueNumber(app.issueUrl);
    const appUrl = app.webUrl || app.repositoryUrl;
    const repository = app.repositoryUrl?.match(
        /^https:\/\/github\.com\/([^/?#]+\/[^/?#]+)/i,
    )?.[1];

    return (
        <Surface
            variant="card"
            className="flex flex-col overflow-hidden rounded-2xl! p-0!"
        >
            <Screenshot src={app.screenshotUrl} />
            <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
                <div className="flex min-w-0 items-center gap-2">
                    <Text
                        as="h3"
                        weight="semibold"
                        className="min-w-0 truncate"
                    >
                        {appUrl ? (
                            <InlineLink href={appUrl}>{app.name}</InlineLink>
                        ) : (
                            app.name
                        )}
                    </Text>
                    {/* Only a Pollinations Pay app reports traffic; the count is its own. */}
                    {app.requests24h !== null && (
                        <Chip
                            intent="info"
                            size="sm"
                            className="ml-auto shrink-0 tabular-nums"
                        >
                            <PulseIcon className="h-3 w-3" />
                            {formatCount(app.requests24h)} req /24h
                        </Chip>
                    )}
                </div>
                <Text
                    as="p"
                    className="line-clamp-2 min-h-[2lh] text-sm text-theme-text-muted wrap-anywhere"
                >
                    {app.description}
                </Text>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    {app.category && (
                        <Chip
                            intent="neutral"
                            size="sm"
                            className="text-theme-text-muted!"
                        >
                            {CATEGORY_LABELS[app.category as AppCategory] ??
                                app.category}
                        </Chip>
                    )}
                    {app.platforms.map((platform) => (
                        <Chip
                            key={platform}
                            intent="neutral"
                            size="sm"
                            className="text-theme-text-muted!"
                        >
                            {PLATFORM_LABELS[platform as AppPlatform] ??
                                platform}
                        </Chip>
                    ))}
                    {/* Same look as the keys page's "Earnings on" chip. */}
                    {app.byop && (
                        <Chip intent="success" size="sm">
                            Pollinations Pay
                        </Chip>
                    )}
                </div>
                <div className="mt-auto flex min-w-0 items-center gap-3 pt-1 text-xs">
                    {app.repositoryUrl && (
                        <InlineLink
                            href={app.repositoryUrl}
                            tone="quiet"
                            className="min-w-0 truncate"
                        >
                            <GitHubIcon
                                aria-hidden="true"
                                className="mr-1 inline h-3.5 w-3.5 align-[-0.125em]"
                            />
                            {repository ?? "Repository"}
                        </InlineLink>
                    )}
                    {(approved || (app.issueUrl && issue)) && (
                        <span className="ml-auto shrink-0 text-theme-text-muted">
                            {app.issueUrl && issue ? (
                                <InlineLink
                                    href={app.issueUrl}
                                    tone="quiet"
                                    title={`View submission #${issue}`}
                                >
                                    <IssueIcon />
                                    {approved
                                        ? `Approved ${approved}`
                                        : `Submission #${issue}`}
                                </InlineLink>
                            ) : (
                                <>
                                    <IssueIcon />
                                    Approved {approved}
                                </>
                            )}
                        </span>
                    )}
                </div>
            </div>
        </Surface>
    );
}

export function MyApps({
    apps,
    githubConnected,
    onRetry,
}: {
    apps: ListedApp[] | null | undefined;
    githubConnected: boolean;
    onRetry: () => Promise<void>;
}) {
    const submitAction = (
        <Button
            intent="commit"
            as="a"
            href={SUBMIT_APP_URL}
            target="_blank"
            rel="noreferrer"
            icon={<GitHubIcon />}
        >
            Submit
        </Button>
    );

    return (
        <Section
            title="My Apps"
            action={apps && apps.length > 0 ? submitAction : undefined}
        >
            {apps === undefined ? (
                <CardLoading />
            ) : apps === null ? (
                <LoadError onRetry={onRetry} paths={["/account/apps"]}>
                    Couldn’t load your apps. Please try again.
                </LoadError>
            ) : (
                <>
                    {apps.length === 0 ? (
                        <Surface className="p-6 text-center">
                            <div className="mb-2">{submitAction}</div>
                            <p className="text-sm text-theme-text-muted">
                                Apps you submit to the community catalog show up
                                here once a maintainer approves them.
                            </p>
                        </Surface>
                    ) : (
                        <div className="@container">
                            <div className="grid auto-rows-fr grid-cols-1 gap-3 @min-[40rem]:grid-cols-2">
                                {apps.map((app) => (
                                    <AppCard
                                        key={`${app.name}|${app.webUrl}`}
                                        app={app}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                    <p className="flex items-start gap-1.5 px-1 text-[13px] leading-snug text-theme-text-muted">
                        <GitHubIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {githubConnected ? (
                            <span>
                                Each app here is listed in the Pollinations{" "}
                                <InlineLink href={APP_CATALOG_URL}>
                                    app catalog
                                </InlineLink>
                                : submitted from your connected GitHub account
                                and approved by a maintainer.
                            </span>
                        ) : (
                            <span>
                                Apps here are listed in the Pollinations{" "}
                                <InlineLink href={APP_CATALOG_URL}>
                                    app catalog
                                </InlineLink>{" "}
                                and matched to the GitHub account that submitted
                                them.{" "}
                                <InlineLink href="/account">
                                    Connect GitHub
                                </InlineLink>{" "}
                                on your account page to see yours.
                            </span>
                        )}
                    </p>
                </>
            )}
        </Section>
    );
}
