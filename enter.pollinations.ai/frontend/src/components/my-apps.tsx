import {
    Chip,
    ExternalLinkButton,
    InlineLink,
    Section,
    Surface,
    Text,
    WalletIcon,
} from "@pollinations/ui";
import { useCallback, useEffect, useState } from "react";
import { accountClient } from "../api.ts";
import type { ListedApp } from "../backend-types.ts";
import { LoadError, SectionContent } from "./layout/dashboard-loading.tsx";

const SUBMIT_URL =
    "https://github.com/pollinations/pollinations/issues/new?template=app-submission.yml";
const DIRECTORY_URL = "https://pollinations.ai/apps";

const appHref = (app: ListedApp) => app.webUrl || app.repositoryUrl;

const formatStars = (raw: string): string => {
    // The catalog formats repository stars as "⭐1.2k" / "⭐34".
    const match = raw?.match(/([\d.]+)\s*([kK])?/);
    if (!match) return "";
    return match[2] ? `${match[1]}k` : match[1];
};

/** A real product screenshot when the listing has one; the emoji otherwise. */
function AppScreenshot({ app }: { app: ListedApp }) {
    const [failed, setFailed] = useState(false);
    const screenshot = app.screenshotUrl && !failed ? app.screenshotUrl : null;

    return screenshot ? (
        <img
            src={screenshot}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className="block h-32 w-full bg-theme-bg-subtle object-cover object-top sm:h-36"
        />
    ) : (
        <div className="flex h-24 w-full items-center justify-center bg-theme-bg-subtle text-4xl">
            <span aria-hidden="true">{app.emoji}</span>
        </div>
    );
}

function AppCard({ app }: { app: ListedApp }) {
    const requests = app.requests24h;
    const stars = formatStars(app.repositoryStars);
    const platforms = app.platform
        .split(",")
        .map((platform) => platform.trim())
        .filter(Boolean)
        .join(" · ");

    return (
        <Surface className="flex flex-col gap-3 p-0">
            <AppScreenshot app={app} />
            <div className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <Text
                        tone="strong"
                        weight="semibold"
                        className="min-w-0 break-words"
                    >
                        {app.name}
                    </Text>
                    <div className="flex flex-wrap gap-1.5">
                        {app.byop && (
                            <Chip intent="success" size="md">
                                <span className="flex items-center gap-1">
                                    <WalletIcon className="h-3.5 w-3.5" />
                                    Pollen pay
                                </span>
                            </Chip>
                        )}
                        <Chip size="md">{app.category}</Chip>
                    </div>
                </div>
                <Text size="sm" tone="muted" className="line-clamp-2">
                    {app.description}
                </Text>
                <Text size="sm" tone="muted">
                    {[
                        platforms,
                        `listed ${app.approvedDate}`,
                        requests === null
                            ? null
                            : `${requests.toLocaleString()} requests today`,
                        stars,
                    ]
                        .filter(Boolean)
                        .join(" · ")}
                </Text>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {app.webUrl && (
                        <InlineLink href={app.webUrl} className="text-sm">
                            Open app
                        </InlineLink>
                    )}
                    {app.repositoryUrl && (
                        <InlineLink
                            href={app.repositoryUrl}
                            className="text-sm"
                        >
                            Source
                        </InlineLink>
                    )}
                </div>
            </div>
        </Surface>
    );
}

function NoApps() {
    return (
        <Surface className="flex flex-col items-center gap-3 p-6 text-center">
            <span aria-hidden="true" className="text-4xl">
                🚀
            </span>
            <Text tone="strong" weight="semibold">
                You haven’t listed an app yet
            </Text>
            <Text size="sm" tone="muted" className="max-w-md">
                Apps built on Pollinations are listed in the{" "}
                <InlineLink href={DIRECTORY_URL}>community catalog</InlineLink>{" "}
                with their own screenshot, category, and request stats. Users
                can spend their own Pollen in apps that support it. Listing is
                free: an automated check runs first, then a maintainer approves.
            </Text>
            <ExternalLinkButton
                href={SUBMIT_URL}
                intent="brand"
                size="md"
                data-theme="accent"
            >
                Submit your app
            </ExternalLinkButton>
        </Surface>
    );
}

export function MyApps() {
    const [apps, setApps] = useState<ListedApp[] | null>(null);
    const [error, setError] = useState(false);

    const load = useCallback(async () => {
        setApps(null);
        setError(false);
        try {
            const response = await accountClient["my-apps"].$get();
            if (!response.ok) throw new Error(`${response.status}`);
            const { apps: listed } = (await response.json()) as {
                apps: ListedApp[];
            };
            setApps(listed);
        } catch {
            setError(true);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const totalRequests = (apps ?? []).reduce(
        (sum, app) => sum + (app.requests24h ?? 0),
        0,
    );

    return (
        <Section
            title="Apps"
            intro="The apps you listed in the community catalog, matched to your GitHub account."
        >
            <SectionContent loading={!apps && !error}>
                {error ? (
                    <LoadError onRetry={load}>
                        Couldn’t load your apps.
                    </LoadError>
                ) : (
                    apps && (
                        <>
                            {apps.length > 0 && (
                                <Text size="sm" tone="muted">
                                    {apps.length === 1
                                        ? "1 app"
                                        : `${apps.length} apps`}
                                    {totalRequests > 0 &&
                                        ` · ${totalRequests.toLocaleString()} requests today`}
                                </Text>
                            )}
                            <div className="grid gap-3 sm:grid-cols-2">
                                {apps.map((app) => (
                                    <AppCard
                                        key={`${app.name}|${appHref(app)}`}
                                        app={app}
                                    />
                                ))}
                            </div>
                            {apps.length === 0 && <NoApps />}
                        </>
                    )
                )}
            </SectionContent>
        </Section>
    );
}
