import { Chip, InlineLink, Section, Surface } from "@pollinations/ui";
import { useCallback, useEffect, useState } from "react";
import { accountClient } from "../api.ts";
import { LoadError, SectionContent } from "./layout/dashboard-loading.tsx";

type ListedApp = {
    name: string;
    webUrl: string;
    screenshotUrl: string | null;
    description: string;
    category: string;
    platform: string;
    repositoryUrl: string | null;
    repositoryStars: number | null;
    issueUrl: string | null;
    approvedDate: string | null;
    byop: boolean | number | string;
    requests24h: number | string | null;
};

const APP_SUBMISSION_URL =
    "https://github.com/pollinations/pollinations/issues/new?template=app-submission.yml";

function supportsPollen(value: ListedApp["byop"]): boolean {
    return value === true || value === 1 || value === "true";
}

function formatCount(value: number | string | null): string | null {
    if (value === null || String(value).trim() === "") return null;
    const count = Number(value);
    return Number.isFinite(count) && count >= 0
        ? new Intl.NumberFormat().format(count)
        : null;
}

export function MyApps() {
    const [apps, setApps] = useState<ListedApp[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const response = await accountClient.apps.$get();
            if (!response.ok) throw new Error("Could not load apps");
            const body = (await response.json()) as { apps: ListedApp[] };
            setApps(body.apps);
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <Section title="My Apps">
            <p className="mb-4 text-sm text-theme-text-muted">
                Community apps listed under your GitHub account.
            </p>
            <SectionContent loading={loading}>
                {error ? (
                    <LoadError onRetry={load}>
                        Couldn’t load your apps.
                    </LoadError>
                ) : apps.length === 0 ? (
                    <Surface>
                        <div className="space-y-2">
                            <h2 className="font-semibold text-theme-text-strong">
                                No listed apps yet
                            </h2>
                            <p className="text-sm text-theme-text-muted">
                                Once an app is approved for the community
                                catalog, it will appear here.
                            </p>
                            <InlineLink href={APP_SUBMISSION_URL}>
                                Submit an app
                            </InlineLink>
                        </div>
                    </Surface>
                ) : (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        {apps.map((app) => (
                            <Surface
                                key={`${app.name}|${app.webUrl || app.repositoryUrl || ""}`}
                                className="overflow-hidden p-0"
                            >
                                {app.screenshotUrl && (
                                    <img
                                        src={app.screenshotUrl}
                                        alt={`${app.name} screenshot`}
                                        loading="lazy"
                                        className="aspect-[16/7] w-full bg-surface-muted object-cover"
                                    />
                                )}
                                <div className="space-y-3 p-4">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h2 className="mr-auto font-semibold text-theme-text-strong">
                                            {app.name}
                                        </h2>
                                        <Chip intent="neutral" size="sm">
                                            {app.category}
                                        </Chip>
                                        <Chip intent="neutral" size="sm">
                                            {app.platform}
                                        </Chip>
                                        {supportsPollen(app.byop) && (
                                            <Chip intent="news" size="sm">
                                                Uses your Pollen
                                            </Chip>
                                        )}
                                    </div>
                                    <p className="text-sm leading-relaxed text-theme-text-muted">
                                        {app.description}
                                    </p>
                                    <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                                        <InlineLink href={app.webUrl}>
                                            Open app
                                        </InlineLink>
                                        {app.repositoryUrl && (
                                            <InlineLink
                                                href={app.repositoryUrl}
                                            >
                                                Source repository
                                            </InlineLink>
                                        )}
                                        {app.issueUrl && (
                                            <InlineLink href={app.issueUrl}>
                                                Submission
                                            </InlineLink>
                                        )}
                                        {app.approvedDate && (
                                            <span className="text-theme-text-muted">
                                                Listed {app.approvedDate}
                                            </span>
                                        )}
                                    </div>
                                    {(app.repositoryStars !== null ||
                                        (supportsPollen(app.byop) &&
                                            formatCount(app.requests24h) !==
                                                null)) && (
                                        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-theme-text-muted">
                                            {app.repositoryStars !== null && (
                                                <span>
                                                    ★{" "}
                                                    {new Intl.NumberFormat().format(
                                                        app.repositoryStars,
                                                    )}{" "}
                                                    repository stars
                                                </span>
                                            )}
                                            {supportsPollen(app.byop) &&
                                                formatCount(app.requests24h) !==
                                                    null && (
                                                    <span>
                                                        {formatCount(
                                                            app.requests24h,
                                                        )}{" "}
                                                        requests in 24h
                                                    </span>
                                                )}
                                        </div>
                                    )}
                                </div>
                            </Surface>
                        ))}
                    </div>
                )}
            </SectionContent>
        </Section>
    );
}
