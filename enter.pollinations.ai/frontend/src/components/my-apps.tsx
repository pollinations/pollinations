import {
    Button,
    ButtonGroup,
    Chip,
    InlineLink,
    PlusIcon,
    RefreshIcon,
    Section,
    Surface,
    Text,
} from "@pollinations/ui";
import { useCallback, useEffect, useState } from "react";
import {
    appIdentity,
    fetchMyApps,
    isByop,
    type ListedApp,
} from "../lib/my-apps.ts";
import { LoadError, SectionContent } from "./layout/dashboard-loading.tsx";

const SUBMIT_URL =
    "https://github.com/pollinations/pollinations/issues/new?template=app-submission.yml";

function AppCard({ app }: { app: ListedApp }) {
    const [hideImage, setHideImage] = useState(false);
    const primaryHref = app.web_url || app.github_repository_url;
    const requests = Number(app.requests_24h);
    const showImage = Boolean(app.screenshot_url) && !hideImage;

    return (
        <Surface className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-4">
            {showImage && (
                <img
                    src={app.screenshot_url}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    onError={() => setHideImage(true)}
                    className="aspect-[16/10] w-full shrink-0 rounded-lg bg-theme-bg-subtle object-cover object-top sm:w-36"
                />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <Text
                        tone="strong"
                        weight="semibold"
                        className="break-words"
                    >
                        {app.emoji ? `${app.emoji} ` : ""}
                        {primaryHref ? (
                            <InlineLink href={primaryHref}>
                                {app.name}
                            </InlineLink>
                        ) : (
                            app.name
                        )}
                    </Text>
                    <div className="flex flex-wrap gap-1.5">
                        {app.category && <Chip size="md">{app.category}</Chip>}
                        {app.platform && <Chip size="md">{app.platform}</Chip>}
                        {isByop(app) && <Chip size="md">Pollen Pay</Chip>}
                        {app.github_repository_stars && (
                            <Chip size="md">{app.github_repository_stars}</Chip>
                        )}
                    </div>
                </div>
                {app.description && (
                    <Text size="sm" tone="muted" className="line-clamp-2">
                        {app.description}
                    </Text>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-xs text-theme-text-muted">
                    {app.approved_date && (
                        <span>Listed {app.approved_date.slice(0, 10)}</span>
                    )}
                    {Number.isFinite(requests) && requests > 0 && (
                        <span>{requests.toLocaleString()} requests (24h)</span>
                    )}
                    {app.web_url && (
                        <InlineLink href={app.web_url} size="sm">
                            Open app
                        </InlineLink>
                    )}
                    {app.github_repository_url && (
                        <InlineLink href={app.github_repository_url} size="sm">
                            Repository
                        </InlineLink>
                    )}
                    {app.issue_url && (
                        <InlineLink href={app.issue_url} size="sm">
                            Listing issue
                        </InlineLink>
                    )}
                </div>
            </div>
        </Surface>
    );
}

export function MyApps({ githubId }: { githubId: string | null }) {
    const [apps, setApps] = useState<ListedApp[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            setApps(await fetchMyApps(githubId));
        } catch {
            setLoadError("Couldn’t load your listed apps.");
        } finally {
            setLoading(false);
        }
    }, [githubId]);

    useEffect(() => {
        void load();
    }, [load]);

    const submitAction = (
        <Button
            as="a"
            href={SUBMIT_URL}
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
            intent="brand"
            data-theme="accent"
        >
            <PlusIcon className="h-4 w-4" />
            Submit app
        </Button>
    );

    return (
        <Section
            title="My Apps"
            intro="Apps listed under your GitHub account in the community directory."
            action={
                <ButtonGroup>
                    <Button
                        size="sm"
                        intent="neutral"
                        icon={<RefreshIcon />}
                        disabled={loading}
                        onClick={() => void load()}
                    >
                        Refresh
                    </Button>
                    {apps.length > 0 && submitAction}
                </ButtonGroup>
            }
        >
            {loadError && <LoadError onRetry={load}>{loadError}</LoadError>}
            <SectionContent loading={loading}>
                {!loadError &&
                    (apps.length > 0 ? (
                        <div className="flex flex-col gap-3">
                            <Text size="sm" tone="muted">
                                {apps.length}{" "}
                                {apps.length === 1
                                    ? "listed app"
                                    : "listed apps"}{" "}
                                in the{" "}
                                <InlineLink href="https://pollinations.ai/apps">
                                    app directory
                                </InlineLink>
                                .
                            </Text>
                            <div
                                className="flex flex-col gap-2"
                                aria-live="polite"
                            >
                                {apps.map((app) => (
                                    <AppCard key={appIdentity(app)} app={app} />
                                ))}
                            </div>
                        </div>
                    ) : (
                        <Surface className="flex flex-col items-start gap-3 p-5">
                            <div className="flex flex-col gap-1">
                                <Text tone="strong" weight="semibold">
                                    No listed apps yet
                                </Text>
                                <Text size="sm" tone="muted">
                                    Submit an app to the{" "}
                                    <InlineLink href="https://pollinations.ai/apps">
                                        community directory
                                    </InlineLink>{" "}
                                    with this GitHub account and it will show up
                                    here once approved.
                                </Text>
                            </div>
                            {submitAction}
                        </Surface>
                    ))}
            </SectionContent>
        </Section>
    );
}
