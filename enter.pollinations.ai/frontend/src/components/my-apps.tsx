import { Chip, InlineLink, Section, Surface, Text } from "@pollinations/ui";
import { useEffect, useState } from "react";
import { fetchMyApps, type ListedApp } from "../lib/my-apps.ts";
import { LoadError, SectionContent } from "./layout/dashboard-loading.tsx";

const SUBMIT_URL =
    "https://github.com/pollinations/pollinations/issues/new?template=app-submission.yml";

function AppCard({ app }: { app: ListedApp }) {
    const requests = Number(app.requests_24h);
    const link = app.web_url || app.github_repository_url;
    return (
        <Surface className="flex flex-col gap-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Text tone="strong" weight="semibold" className="break-words">
                    {app.emoji} {app.name}
                </Text>
                <div className="flex flex-wrap gap-1.5">
                    <Chip size="md">{app.category}</Chip>
                    {app.github_repository_stars && (
                        <Chip size="md">{app.github_repository_stars}</Chip>
                    )}
                </div>
            </div>
            <Text size="sm" tone="muted">
                {app.description}
            </Text>
            <Text size="sm" tone="muted">
                {app.platform} · listed {app.approved_date.slice(0, 10)}
                {requests > 0 &&
                    ` · ${requests.toLocaleString()} requests today`}
            </Text>
            {link && (
                <InlineLink href={link} className="break-all text-sm">
                    {link}
                </InlineLink>
            )}
        </Surface>
    );
}

export function MyApps({ githubId }: { githubId: string | null }) {
    const [apps, setApps] = useState<ListedApp[] | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        setApps(null);
        setError(false);
        if (githubId === null) return setApps([]);
        let current = true;
        fetchMyApps(githubId)
            .then((rows) => current && setApps(rows))
            .catch(() => current && setError(true));
        return () => {
            current = false;
        };
    }, [githubId]);

    return (
        <Section
            title="Apps"
            intro="The apps you listed in the community catalog, matched to your GitHub account."
        >
            <SectionContent loading={!apps && !error}>
                {error ? (
                    <LoadError>Couldn’t load the app catalog.</LoadError>
                ) : (
                    <div className="grid gap-3">
                        {apps?.map((app) => (
                            <AppCard
                                key={`${app.name}|${app.web_url || app.github_repository_url}`}
                                app={app}
                            />
                        ))}
                        {apps?.length === 0 && (
                            <Surface className="p-6 text-center">
                                <Text size="sm" tone="muted">
                                    You haven’t listed an app yet.{" "}
                                    <InlineLink href={SUBMIT_URL}>
                                        Submit yours
                                    </InlineLink>{" "}
                                    to show it here.
                                </Text>
                            </Surface>
                        )}
                    </div>
                )}
            </SectionContent>
        </Section>
    );
}
