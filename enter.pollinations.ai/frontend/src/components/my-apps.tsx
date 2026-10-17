import {
    AppIcon,
    Button,
    Chip,
    EmptyState,
    ExternalLinkButton,
    InlineLink,
    RefreshIcon,
    Section,
    Surface,
    Text,
} from "@pollinations/ui";
import { useCallback, useEffect, useState } from "react";
import { accountClient } from "../api.ts";
import type { ListedAppRow } from "../backend-types.ts";
import { LoadError, SectionContent } from "./layout/dashboard-loading.tsx";

const SUBMIT_APP_URL =
    "https://github.com/pollinations/pollinations/issues/new?template=app-submission.yml";

// The catalog stores byop and requests_24h loosely typed (synced Tinybird
// columns), the same truthiness rule the website's app directory uses.
const isPollen = (app: ListedAppRow) =>
    app.byop === true || app.byop === 1 || app.byop === "true";

/** BYOP traffic only; non-BYOP counts belong to the developer, not the app. */
function requests24h(app: ListedAppRow): number | null {
    if (
        !isPollen(app) ||
        app.requests_24h == null ||
        String(app.requests_24h).trim() === ""
    ) {
        return null;
    }
    const requests = Number(app.requests_24h);
    return Number.isFinite(requests) && requests >= 0 ? requests : null;
}

function AppCard({ app }: { app: ListedAppRow }) {
    const requests = requests24h(app);
    return (
        <Surface className="flex gap-4 p-4">
            {app.screenshot_url && (
                <img
                    src={app.screenshot_url}
                    alt=""
                    loading="lazy"
                    className="hidden h-24 w-40 shrink-0 rounded-md object-cover sm:block"
                />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xl" aria-hidden="true">
                        {app.emoji}
                    </span>
                    <a
                        href={app.web_url || app.github_repository_url}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 truncate font-semibold text-theme-text-strong hover:underline"
                    >
                        {app.name}
                    </a>
                    {app.category && <Chip size="sm">{app.category}</Chip>}
                    {isPollen(app) && (
                        <Chip size="sm" intent="info">
                            Pollen Pay
                        </Chip>
                    )}
                </div>
                <Text size="sm" tone="muted">
                    {app.description}
                </Text>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-theme-text-muted">
                    {app.platform && <span>{app.platform}</span>}
                    {requests !== null && (
                        <span>{requests} requests in the last 24h</span>
                    )}
                    {app.approved_date && (
                        <span>
                            Listed{" "}
                            {new Date(app.approved_date).toLocaleDateString()}
                        </span>
                    )}
                    {app.github_repository_stars && (
                        <span>★ {app.github_repository_stars}</span>
                    )}
                </div>
                <div className="flex flex-wrap gap-3 text-xs">
                    {app.github_repository_url && (
                        <InlineLink href={app.github_repository_url}>
                            Repository
                        </InlineLink>
                    )}
                    {app.issue_url && (
                        <InlineLink href={app.issue_url}>
                            Submission issue
                        </InlineLink>
                    )}
                    <InlineLink href="https://pollinations.ai/apps">
                        In the catalog
                    </InlineLink>
                </div>
            </div>
        </Surface>
    );
}

export function MyApps() {
    const [apps, setApps] = useState<ListedAppRow[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoadError(null);
        try {
            const response = await accountClient.apps.$get();
            if (!response.ok) {
                throw new Error(
                    `Couldn't load your apps (${response.status}).`,
                );
            }
            const body = await response.json();
            setApps(body.apps);
        } catch (error) {
            setLoadError(
                error instanceof Error
                    ? error.message
                    : "Couldn't load your apps.",
            );
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const loading = apps === null && !loadError;

    return (
        <Section
            title="My Apps"
            action={
                <Button
                    size="sm"
                    intent="neutral"
                    icon={<RefreshIcon />}
                    disabled={loading}
                    onClick={() => {
                        setApps(null);
                        void load();
                    }}
                >
                    Refresh
                </Button>
            }
        >
            {loadError && <LoadError onRetry={load}>{loadError}</LoadError>}
            <SectionContent loading={loading}>
                <div className="flex flex-col gap-2" aria-live="polite">
                    {apps?.map((app) => (
                        <AppCard
                            key={`${app.name}|${app.web_url || app.github_repository_url}`}
                            app={app}
                        />
                    ))}
                    {apps?.length === 0 && (
                        <EmptyState>
                            You haven't listed an app yet. Listings come from
                            the community app directory.{" "}
                            <ExternalLinkButton href={SUBMIT_APP_URL} size="sm">
                                Submit an app
                            </ExternalLinkButton>
                        </EmptyState>
                    )}
                </div>
            </SectionContent>
            <p className="flex items-start gap-1.5 px-1 text-[13px] leading-snug text-theme-text-muted">
                <AppIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                    Apps are matched to the GitHub account on your profile and
                    come from the{" "}
                    <InlineLink href="https://pollinations.ai/apps">
                        community app directory
                    </InlineLink>
                    , refreshed daily.{" "}
                    <InlineLink href={SUBMIT_APP_URL}>Submit an app</InlineLink>{" "}
                    to see it here once it's approved.
                </span>
            </p>
        </Section>
    );
}
