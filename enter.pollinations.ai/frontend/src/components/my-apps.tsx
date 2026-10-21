import {
    Button,
    Chip,
    ExternalLinkIcon,
    GitHubIcon,
    InlineLink,
    Section,
    Surface,
    Text,
} from "@pollinations/ui";
import type { ListedApp } from "../backend-types.ts";
import { LoadError, PageStatus } from "./layout/dashboard-loading.tsx";

/** The submission form every listed app started as (issue template). */
const SUBMIT_APP_URL =
    "https://github.com/pollinations/pollinations/issues/new?template=app-submission.yml";
const CATALOG_URL = "https://pollinations.ai/apps";

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

/** A listing's submission issue, shown as "#123" beside its links. */
function issueNumber(url: string | null): string | null {
    return url?.match(/\/issues\/(\d+)/)?.[1] ?? null;
}

function AppCard({ app }: { app: ListedApp }) {
    const approved = formatDate(app.approvedDate);
    const issue = issueNumber(app.issueUrl);

    return (
        <Surface variant="card" className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
                {app.screenshotUrl ? (
                    <img
                        src={app.screenshotUrl}
                        alt=""
                        loading="lazy"
                        width={96}
                        height={64}
                        className="h-16 w-24 shrink-0 rounded-lg bg-theme-bg-subtle object-cover"
                    />
                ) : null}
                <div className="flex min-w-0 flex-col gap-1">
                    <Text as="span" weight="semibold">
                        {app.emoji ? `${app.emoji} ` : ""}
                        {app.name}
                    </Text>
                    {app.description && (
                        <Text
                            as="p"
                            className="line-clamp-2 text-sm text-theme-text-muted"
                        >
                            {app.description}
                        </Text>
                    )}
                </div>
            </div>

            {(app.category ||
                app.platforms.length > 0 ||
                app.byop ||
                approved) && (
                <div className="flex flex-wrap items-center gap-1.5">
                    {app.category && (
                        <Chip intent="neutral" size="sm">
                            {app.category}
                        </Chip>
                    )}
                    {app.platforms.map((platform) => (
                        <Chip key={platform} intent="neutral" size="sm">
                            {platform}
                        </Chip>
                    ))}
                    {app.byop && (
                        <Chip intent="info" size="sm">
                            Pollen Pay
                        </Chip>
                    )}
                    {approved && (
                        <Chip intent="success" size="sm">
                            Approved {approved}
                        </Chip>
                    )}
                </div>
            )}

            <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                {app.webUrl && (
                    <InlineLink href={app.webUrl}>Open app</InlineLink>
                )}
                {app.repositoryUrl && (
                    <InlineLink href={app.repositoryUrl}>Repository</InlineLink>
                )}
                {app.issueUrl && issue && (
                    <InlineLink href={app.issueUrl}>#{issue}</InlineLink>
                )}
                {/* Only a Pollen Pay app reports traffic; the count is its own. */}
                {app.requests24h !== null && (
                    <span className="ml-auto shrink-0 text-xs tabular-nums text-theme-text-muted">
                        {app.requests24h.toLocaleString("en-US")} requests · 24h
                    </span>
                )}
            </div>
        </Surface>
    );
}

function EmptyState() {
    return (
        <Surface variant="card" className="flex flex-col items-start gap-3">
            <div className="flex flex-col gap-1">
                <Text as="span" weight="semibold">
                    You haven’t listed an app yet
                </Text>
                <Text as="p" className="text-sm text-theme-text-muted">
                    Apps you submit to the community catalog show up here, with
                    their approval date, links and Pollen Pay traffic, once a
                    maintainer approves them.
                </Text>
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <Button
                    as="a"
                    href={SUBMIT_APP_URL}
                    target="_blank"
                    rel="noreferrer"
                    intent="commit"
                    icon={<ExternalLinkIcon />}
                >
                    Submit your app
                </Button>
                <InlineLink href={CATALOG_URL}>Browse the catalog</InlineLink>
            </div>
            <Text as="p" className="text-xs text-theme-text-muted">
                A listing is matched to the GitHub account you signed in with,
                so submit from the same account.
            </Text>
        </Surface>
    );
}

export function MyApps({
    apps,
    onRetry,
}: {
    apps: ListedApp[] | null | undefined;
    onRetry: () => Promise<void>;
}) {
    return (
        <Section
            title="My Apps"
            intro="Your apps in the community catalog, matched to the GitHub account you signed in with."
            action={
                apps && apps.length > 0 ? (
                    <Button
                        as="a"
                        href={SUBMIT_APP_URL}
                        target="_blank"
                        rel="noreferrer"
                        intent="brand"
                        size="sm"
                        icon={<GitHubIcon />}
                    >
                        Submit another app
                    </Button>
                ) : undefined
            }
        >
            {apps === undefined ? (
                <PageStatus />
            ) : apps === null ? (
                <LoadError onRetry={onRetry}>
                    Couldn’t load your apps. Please try again.
                </LoadError>
            ) : apps.length === 0 ? (
                <EmptyState />
            ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                    {apps.map((app) => (
                        <AppCard key={`${app.name}|${app.webUrl}`} app={app} />
                    ))}
                </div>
            )}
        </Section>
    );
}
