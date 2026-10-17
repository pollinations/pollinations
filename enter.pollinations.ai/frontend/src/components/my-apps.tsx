import {
    Button,
    ButtonGroup,
    Chip,
    InlineLink,
    RefreshIcon,
    Section,
    Surface,
    Text,
} from "@pollinations/ui";
import { useCallback, useEffect, useState } from "react";
import { accountClient } from "../api.ts";
import { appsOwnedBy, type ListedApp } from "../lib/my-apps.ts";
import { Route as DashboardRoute } from "../routes/_dashboard.tsx";
import { LoadError, SectionContent } from "./layout/dashboard-loading.tsx";

const SUBMIT_APP_URL =
    "https://github.com/pollinations/pollinations/issues/new?template=app-submission.yml";

function AppCard({ app }: { app: ListedApp }) {
    return (
        <Surface className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                    <Text tone="strong" weight="semibold" className="break-all">
                        {app.name}
                    </Text>
                    {app.description && (
                        <Text size="sm" tone="muted">
                            {app.description}
                        </Text>
                    )}
                </div>
                {app.approved_date && (
                    <Chip intent="success" size="md">
                        Approved{" "}
                        {new Date(app.approved_date).toLocaleDateString()}
                    </Chip>
                )}
            </div>
            {app.url && (
                <InlineLink href={app.url} showIcon>
                    {app.url}
                </InlineLink>
            )}
        </Surface>
    );
}

export function MyApps() {
    const data = DashboardRoute.useLoaderData();
    const githubId = data.githubId;
    const [apps, setApps] = useState<ListedApp[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoadError(null);
        setLoading(true);
        try {
            const response = await accountClient.apps.$get();
            if (!response.ok) {
                throw new Error(response.statusText || "Failed to load apps");
            }
            const body = (await response.json()) as { apps: ListedApp[] };
            setApps(appsOwnedBy(body.apps, githubId));
        } catch (error) {
            setLoadError(
                error instanceof Error ? error.message : "Couldn't load apps.",
            );
        } finally {
            setLoading(false);
        }
    }, [githubId]);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <Section
            title="My Apps"
            intro="Apps you've submitted to the Pollinations directory. Track their approval status and manage your listings."
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
                </ButtonGroup>
            }
        >
            {loadError && <LoadError onRetry={load}>{loadError}</LoadError>}
            <SectionContent loading={loading}>
                {apps.length > 0 ? (
                    <div className="flex flex-col gap-2" aria-live="polite">
                        {apps.map((app) => (
                            <AppCard key={app.name} app={app} />
                        ))}
                    </div>
                ) : (
                    !loadError && (
                        <Surface className="p-6 text-center">
                            <p className="text-sm text-theme-text-muted">
                                You haven't submitted any apps yet.{" "}
                                <InlineLink href={SUBMIT_APP_URL}>
                                    Submit an app
                                </InlineLink>{" "}
                                to get listed in the Pollinations directory.
                            </p>
                        </Surface>
                    )
                )}
            </SectionContent>
        </Section>
    );
}
