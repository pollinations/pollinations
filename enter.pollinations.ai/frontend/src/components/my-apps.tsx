import {
    AppIcon,
    Button,
    ButtonGroup,
    Chip,
    ExternalLinkButton,
    GitHubIcon,
    InlineLink,
    PlusIcon,
    RefreshIcon,
    Section,
    Surface,
    Text,
    WalletIcon,
} from "@pollinations/ui";
import { useCallback, useEffect, useState } from "react";
import { accountClient } from "../api.ts";
import type { ListedApp } from "../backend-types.ts";
import { readError } from "./community-endpoints/types.ts";
import { LoadError, SectionContent } from "./layout/dashboard-loading.tsx";

const SUBMIT_APP_URL =
    "https://github.com/pollinations/pollinations/issues/new?template=app-submission.yml";

// The directory stores slugs: "video_audio" is shown as "Video & audio".
const categoryLabel = (category: string) =>
    category
        .replace(/_/g, " & ")
        .replace(/^./, (letter) => letter.toUpperCase());

const platformsOf = (platform: string) =>
    platform
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

const submitButton = (
    <ExternalLinkButton
        href={SUBMIT_APP_URL}
        size="sm"
        intent="neutral"
        icon={<PlusIcon />}
    >
        Submit an app
    </ExternalLinkButton>
);

function AppCard({ app }: { app: ListedApp }) {
    const href = app.webUrl ?? app.repositoryUrl;
    return (
        <Surface className="flex flex-col gap-3 sm:flex-row sm:gap-4">
            {app.screenshotUrl && (
                <img
                    src={app.screenshotUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-36 w-full shrink-0 rounded-lg object-cover object-top sm:h-24 sm:w-40"
                />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span aria-hidden="true">{app.emoji}</span>
                    {href ? (
                        <InlineLink href={href} className="font-semibold">
                            {app.name}
                        </InlineLink>
                    ) : (
                        <Text as="span" tone="strong" weight="semibold">
                            {app.name}
                        </Text>
                    )}
                </div>
                <Text size="sm">{app.description}</Text>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-theme-text-muted">
                    <Chip size="sm">{categoryLabel(app.category)}</Chip>
                    {platformsOf(app.platform).map((platform) => (
                        <Chip key={platform} size="sm">
                            {platform}
                        </Chip>
                    ))}
                    {app.byop && (
                        <Chip size="sm" intent="info">
                            <WalletIcon className="h-3 w-3 shrink-0" />
                            Pollen Pay
                        </Chip>
                    )}
                    {app.byop && app.requests24h !== null && (
                        <span>{app.requests24h} requests in the last 24h</span>
                    )}
                    {app.approvedDate && <span>Listed {app.approvedDate}</span>}
                </div>
                {(app.repositoryUrl || app.issueUrl) && (
                    <div className="flex flex-wrap items-center gap-3">
                        {app.repositoryUrl && (
                            <InlineLink
                                href={app.repositoryUrl}
                                size="sm"
                                tone="quiet"
                                className="inline-flex items-center gap-1"
                            >
                                <GitHubIcon className="h-3.5 w-3.5 shrink-0" />
                                Repository
                            </InlineLink>
                        )}
                        {app.issueUrl && (
                            <InlineLink
                                href={app.issueUrl}
                                size="sm"
                                tone="quiet"
                            >
                                Submission
                            </InlineLink>
                        )}
                    </div>
                )}
            </div>
        </Surface>
    );
}

function EmptyApps() {
    return (
        <Surface className="flex flex-col items-center gap-3 p-6 text-center">
            <AppIcon className="h-6 w-6 text-theme-text-muted" />
            <Text tone="strong" weight="semibold">
                You haven’t listed an app yet
            </Text>
            <p className="max-w-md text-sm text-theme-text-muted">
                Submit your app to the community directory and it shows up here.
                Listing one also earns the{" "}
                <InlineLink href="/quests">
                    App listed on Pollinations
                </InlineLink>{" "}
                quest.
            </p>
            <ExternalLinkButton
                href={SUBMIT_APP_URL}
                intent="commit"
                icon={<PlusIcon />}
            >
                Submit an app
            </ExternalLinkButton>
        </Surface>
    );
}

export function MyApps() {
    const [apps, setApps] = useState<ListedApp[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setError(null);
        try {
            const response = await accountClient.apps.$get();
            if (!response.ok) {
                setError(await readError(response));
                return;
            }
            const body = (await response.json()) as { apps: ListedApp[] };
            setApps(body.apps);
        } catch {
            setError("Couldn’t load your apps.");
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const loading = apps === null && error === null;

    return (
        <Section
            title="My Apps"
            intro="The apps you listed in the community directory, newest first, matched to your GitHub account."
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
                    {submitButton}
                </ButtonGroup>
            }
        >
            {error && <LoadError onRetry={load}>{error}</LoadError>}
            <SectionContent loading={loading}>
                {apps &&
                    (apps.length === 0 ? (
                        <EmptyApps />
                    ) : (
                        <div className="flex flex-col gap-2">
                            {apps.map((app) => (
                                <AppCard
                                    key={`${app.name}|${app.webUrl ?? app.repositoryUrl ?? ""}`}
                                    app={app}
                                />
                            ))}
                        </div>
                    ))}
            </SectionContent>
        </Section>
    );
}
