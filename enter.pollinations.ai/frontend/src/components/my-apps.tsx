import {
    Button,
    Chip,
    EmptyState,
    GitHubIcon,
    InlineLink,
    RefreshIcon,
    Section,
    Surface,
    Text,
} from "@pollinations/ui";
import { useCallback, useEffect, useState } from "react";
import { accountClient } from "../api.ts";
import type { MyAppsResponse } from "../backend-types.ts";
import { LoadError, SectionContent } from "./layout/dashboard-loading.tsx";

type MyApp = MyAppsResponse["data"][number];

// The directory stores counts as strings; "" or a non-number reads as none.
const asCount = (raw: string): number | null => {
    const value = Number(raw);
    return raw.trim() !== "" && Number.isFinite(value) ? value : null;
};

const requestsLabel = (app: MyApp) => {
    const requests = asCount(app.requests_24h);
    return requests === null
        ? "Requests last 24 h: —"
        : `${requests.toLocaleString("en-US")} requests last 24 h`;
};

// App names alone are not unique; the directory dedupes on the triple.
const appKey = (app: MyApp) =>
    `${app.name}|${app.web_url || app.github_repository_url}`;

function AppCard({ app }: { app: MyApp }) {
    const stars = asCount(app.github_repository_stars);
    return (
        <Surface className="flex flex-col gap-3 p-4 sm:flex-row">
            {app.screenshot_url ? (
                <img
                    src={app.screenshot_url}
                    alt={`${app.name} screenshot`}
                    loading="lazy"
                    className="aspect-video w-full shrink-0 rounded-md border border-theme-border object-cover sm:w-44"
                />
            ) : (
                <div className="flex aspect-video w-full shrink-0 items-center justify-center rounded-md border border-dashed border-theme-border text-sm text-theme-text-muted">
                    No screenshot
                </div>
            )}
            <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg" aria-hidden="true">
                        {app.emoji}
                    </span>
                    <Text size="sm" tone="strong">
                        {app.name}
                    </Text>
                    {app.category && <Chip>{app.category}</Chip>}
                    {app.platform && <Chip>{app.platform}</Chip>}
                </div>
                <Text size="sm" tone="muted">
                    {app.description}
                </Text>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-theme-text-muted">
                    <span>{requestsLabel(app)}</span>
                    <span>
                        {app.approved_date
                            ? `Approved ${app.approved_date}`
                            : `Submitted ${app.submitted_date}`}
                    </span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <InlineLink href={app.web_url}>Open app</InlineLink>
                    {app.github_repository_url && (
                        <InlineLink href={app.github_repository_url}>
                            <GitHubIcon className="h-4 w-4" />
                            Repository
                        </InlineLink>
                    )}
                    {stars !== null && (
                        <span className="flex items-center gap-1 text-[13px] text-theme-text-muted">
                            <GitHubIcon className="h-3.5 w-3.5" />
                            {stars.toLocaleString("en-US")} stars
                        </span>
                    )}
                </div>
            </div>
        </Surface>
    );
}

export function MyApps() {
    const [apps, setApps] = useState<MyApp[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setApps(null);
        setError(null);
        try {
            const response = await accountClient["my-apps"].$get();
            if (!response.ok) {
                throw new Error(
                    `Couldn’t load your apps (${response.status}).`,
                );
            }
            const body = (await response.json()) as MyAppsResponse;
            setApps(body.data);
        } catch (loadError) {
            setError(
                loadError instanceof Error
                    ? loadError.message
                    : "Couldn’t load your apps.",
            );
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <Section
            title="My Apps"
            intro="Apps in the community directory that are matched to your GitHub account. To list one, open an APP-SUBMISSION issue on the pollinations/pollinations repository."
            action={
                <Button
                    size="sm"
                    intent="neutral"
                    icon={<RefreshIcon />}
                    disabled={apps === null}
                    onClick={() => void load()}
                >
                    Refresh
                </Button>
            }
        >
            {error && <LoadError onRetry={load}>{error}</LoadError>}
            <SectionContent loading={apps === null}>
                {apps !== null &&
                    (apps.length > 0 ? (
                        <div className="flex flex-col gap-3" aria-live="polite">
                            {apps.map((app) => (
                                <AppCard key={appKey(app)} app={app} />
                            ))}
                        </div>
                    ) : (
                        <EmptyState>
                            No listed apps yet. Once an app you submitted is
                            approved, it appears here with its screenshot,
                            links, and request count.
                        </EmptyState>
                    ))}
            </SectionContent>
        </Section>
    );
}
