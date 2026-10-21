import {
    Button,
    Chip,
    GitHubIcon,
    InlineLink,
    RefreshIcon,
    Section,
    StarIcon,
    Surface,
    Text,
    WalletIcon,
} from "@pollinations/ui";
import { Await } from "@tanstack/react-router";
import { useCallback, useDeferredValue, useEffect, useState } from "react";
import {
    appsOwnedBy,
    byopRequests24h,
    type DirectoryApp,
    fetchAppDirectory,
} from "../data/app-directory.ts";
import {
    Route as DashboardRoute,
    useDashboardRetry,
} from "../routes/_dashboard.tsx";
import { LoadError, PageStatus } from "./layout/dashboard-loading.tsx";

export const APP_SUBMISSION_URL =
    "https://github.com/pollinations/pollinations/issues/new?template=app-submission.yml";
export const APP_DIRECTORY_URL = "https://pollinations.ai/apps";

type Profile = { githubId: number | null };

export function MyAppsPage() {
    const retryProfile = useDashboardRetry("profile");
    const { profile } = useDeferredValue(DashboardRoute.useLoaderData());
    return (
        <Await promise={profile} fallback={<PageStatus />}>
            {(details) =>
                details ? (
                    <MyApps githubId={(details as Profile).githubId ?? null} />
                ) : (
                    <LoadError onRetry={retryProfile}>
                        Couldn’t load your profile.
                    </LoadError>
                )
            }
        </Await>
    );
}

function MyApps({ githubId }: { githubId: number | null }) {
    const [directory, setDirectory] = useState<DirectoryApp[] | null>(null);
    const [loadError, setLoadError] = useState(false);

    const load = useCallback(async () => {
        setLoadError(false);
        try {
            setDirectory(await fetchAppDirectory());
        } catch {
            setDirectory(null);
            setLoadError(true);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const apps = directory ? appsOwnedBy(directory, githubId) : [];

    return (
        <Section
            title="My Apps"
            intro={
                <>
                    Apps you listed in the{" "}
                    <InlineLink href={APP_DIRECTORY_URL}>
                        community catalog
                    </InlineLink>
                    , matched to your GitHub account.
                </>
            }
            action={
                <Button
                    size="sm"
                    intent="neutral"
                    icon={<RefreshIcon />}
                    disabled={directory === null}
                    onClick={() => void load()}
                >
                    Refresh
                </Button>
            }
        >
            {loadError ? (
                <LoadError onRetry={load}>
                    Couldn’t load the app catalog.
                </LoadError>
            ) : directory === null ? (
                <PageStatus />
            ) : apps.length === 0 ? (
                <EmptyApps />
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {apps.map((app) => (
                        <AppCard key={`${app.name}|${app.web_url}`} app={app} />
                    ))}
                </div>
            )}
        </Section>
    );
}

function EmptyApps() {
    return (
        <Surface variant="card" className="flex flex-col gap-2 p-5">
            <Text tone="strong" weight="bold">
                No listed apps yet.
            </Text>
            <Text size="sm" tone="muted">
                Built something with Pollinations? Submit it to the community
                catalog and it will show up here, together with its usage.{" "}
                <InlineLink href={APP_SUBMISSION_URL}>List your app</InlineLink>
            </Text>
        </Surface>
    );
}

function AppCard({ app }: { app: DirectoryApp }) {
    const href = app.web_url || app.github_repository_url;
    const stars = app.github_repository_stars?.match(/([\d.]+)\s*([kK])?/);
    const requests = byopRequests24h(app);
    const listed = app.approved_date
        ? new Date(app.approved_date).toLocaleDateString(undefined, {
              month: "short",
              year: "numeric",
          })
        : null;

    return (
        <Surface variant="card" className="overflow-hidden p-0">
            {app.screenshot_url ? (
                <img
                    src={app.screenshot_url}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    decoding="async"
                    className="h-40 w-full object-cover object-top"
                />
            ) : null}
            <div className="flex flex-col gap-2 p-5">
                {href ? (
                    <InlineLink href={href} className="text-base font-semibold">
                        {app.name}
                    </InlineLink>
                ) : (
                    <Text tone="strong" weight="bold">
                        {app.name}
                    </Text>
                )}
                <p className="line-clamp-2 text-sm leading-relaxed text-theme-text-base">
                    {app.description}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-theme-text-muted">
                    {app.category ? (
                        <Chip size="sm">{app.category}</Chip>
                    ) : null}
                    {app.platform ? (
                        <Chip size="sm">{app.platform.split(",")[0]}</Chip>
                    ) : null}
                    {stars ? (
                        <span className="inline-flex items-center gap-1">
                            <StarIcon className="size-3.5 fill-current" />
                            {stars[2] ? `${stars[1]}k` : stars[1]}
                        </span>
                    ) : null}
                    {requests !== null ? (
                        <span className="inline-flex items-center gap-1">
                            <WalletIcon className="size-3.5" />
                            {requests} requests/day
                        </span>
                    ) : null}
                    {app.github_repository_url ? (
                        <a
                            href={app.github_repository_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 hover:text-theme-text-strong"
                        >
                            <GitHubIcon className="size-3.5 shrink-0" />
                            repo
                        </a>
                    ) : null}
                    {listed ? <span>listed {listed}</span> : null}
                </div>
            </div>
        </Surface>
    );
}
