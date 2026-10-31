import {
    Button,
    Chip,
    GitHubIcon,
    InlineLink,
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
import { LoadError, PageStatus } from "./layout/dashboard-loading.tsx";

/** The submission form every listed app started as (issue template). */
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

function AppRow({ app }: { app: ListedApp }) {
    const approved = formatDate(app.approvedDate);
    const issue = issueNumber(app.issueUrl);
    const appUrl = app.webUrl || app.repositoryUrl;
    const repository = app.repositoryUrl?.match(
        /^https:\/\/github\.com\/([^/?#]+\/[^/?#]+)/i,
    )?.[1];

    return (
        <Surface
            variant="card"
            className="flex flex-col overflow-hidden rounded-2xl! p-0! @min-[40rem]:flex-row"
        >
            {app.screenshotUrl ? (
                <div className="relative aspect-video shrink-0 bg-theme-bg-subtle @min-[40rem]:aspect-auto @min-[40rem]:w-48">
                    <img
                        src={app.screenshotUrl}
                        alt=""
                        loading="lazy"
                        width={1280}
                        height={720}
                        className="absolute inset-0 h-full w-full object-cover"
                    />
                </div>
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Text as="h3" weight="semibold" className="wrap-anywhere">
                        {appUrl ? (
                            <InlineLink href={appUrl}>{app.name}</InlineLink>
                        ) : (
                            app.name
                        )}
                    </Text>
                    {app.description && (
                        <Text
                            as="p"
                            className="line-clamp-2 text-sm text-theme-text-muted wrap-anywhere"
                        >
                            {app.description}
                        </Text>
                    )}
                    {(app.category || app.platforms.length > 0 || app.byop) && (
                        <div className="flex flex-wrap items-center gap-1.5">
                            {app.category && (
                                <Chip
                                    intent="neutral"
                                    size="sm"
                                    className="text-theme-text-muted!"
                                >
                                    {CATEGORY_LABELS[
                                        app.category as AppCategory
                                    ] ?? app.category}
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
                            {app.byop && (
                                <Chip intent="info" size="sm">
                                    Pollinations Pay
                                </Chip>
                            )}
                        </div>
                    )}
                </div>
                <div className="flex min-w-0 flex-col items-start gap-2">
                    <div className="flex max-w-full flex-wrap items-center gap-x-3 gap-y-2 text-xs">
                        {app.repositoryUrl && (
                            <InlineLink
                                href={app.repositoryUrl}
                                tone="quiet"
                                className="max-w-full wrap-anywhere"
                            >
                                {repository && (
                                    <GitHubIcon
                                        aria-hidden="true"
                                        className="mr-1 inline h-3.5 w-3.5 align-[-0.125em]"
                                    />
                                )}
                                {repository ?? "Repository"}
                            </InlineLink>
                        )}
                        {(approved || (app.issueUrl && issue)) && (
                            <span className="text-theme-text-muted">
                                {app.issueUrl && issue ? (
                                    <InlineLink
                                        href={app.issueUrl}
                                        tone="quiet"
                                        title={`View submission #${issue}`}
                                    >
                                        <svg
                                            aria-hidden="true"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth={2}
                                            className="mr-1 inline h-3.5 w-3.5 align-[-0.125em]"
                                        >
                                            <circle cx={12} cy={12} r={9} />
                                            <circle
                                                cx={12}
                                                cy={12}
                                                r={1}
                                                fill="currentColor"
                                                stroke="none"
                                            />
                                        </svg>
                                        {approved
                                            ? `Approved ${approved}`
                                            : `Submission #${issue}`}
                                    </InlineLink>
                                ) : (
                                    `Approved ${approved}`
                                )}
                            </span>
                        )}
                    </div>
                    {/* Only a Pollinations Pay app reports traffic; the count is its own. */}
                    {app.requests24h !== null && (
                        <span className="text-xs tabular-nums text-theme-text-muted">
                            {app.requests24h.toLocaleString("en-US")} requests ·
                            24h
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
            intro="Your published apps in the community catalog."
            action={apps && apps.length > 0 ? submitAction : undefined}
        >
            {apps === undefined ? (
                <PageStatus />
            ) : apps === null ? (
                <LoadError onRetry={onRetry} paths={["/account/apps"]}>
                    Couldn’t load your apps. Please try again.
                </LoadError>
            ) : (
                <>
                    <div className="@container flex flex-col gap-2">
                        {apps.length === 0 ? (
                            <Surface className="p-6 text-center">
                                <div className="mb-2">{submitAction}</div>
                                <p className="text-sm text-theme-text-muted">
                                    Apps you submit to the community catalog
                                    show up here once a maintainer approves
                                    them.
                                </p>
                            </Surface>
                        ) : (
                            apps.map((app) => (
                                <AppRow
                                    key={`${app.name}|${app.webUrl}`}
                                    app={app}
                                />
                            ))
                        )}
                    </div>
                    <p className="flex items-start gap-1.5 px-1 text-[13px] leading-snug text-theme-text-muted">
                        <GitHubIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {githubConnected ? (
                            <span>
                                A listing is matched to your connected GitHub
                                account, so submit from that account.
                            </span>
                        ) : (
                            <span>
                                Listings are matched to a GitHub account.{" "}
                                <InlineLink href="/account">
                                    Connect GitHub
                                </InlineLink>{" "}
                                on your account page, then submit from that
                                account.
                            </span>
                        )}
                    </p>
                </>
            )}
        </Section>
    );
}
