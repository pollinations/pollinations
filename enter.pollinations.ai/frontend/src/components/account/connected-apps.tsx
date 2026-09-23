import {
    Alert,
    AppIcon,
    BotIcon,
    Button,
    InlineLink,
    Input,
    LockIcon,
    LogInIcon,
    LogOutIcon,
    SearchIcon,
    Section,
    Surface,
    Text,
} from "@pollinations/ui";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { apiClient } from "../../api.ts";

type Connection = {
    id: string;
    toolkit: string;
    name: string | null;
    description: string;
    logo: string | null;
    alias: string | null;
};

type Toolkit = {
    slug: string;
    name: string;
    description: string;
    logo: string | null;
};

function readableSlug(slug: string): string {
    return slug
        .split(/[_-]/)
        .filter(Boolean)
        .map((part) => part[0]?.toUpperCase() + part.slice(1))
        .join(" ");
}

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
}

type AppCardProps = {
    name: string;
    logo: string | null;
    details?: ReactNode;
    pending: boolean;
    onAction: () => void;
    connected?: boolean;
};

function AppCard({
    name,
    logo,
    details,
    pending,
    onAction,
    connected = false,
}: AppCardProps) {
    const actionLabel = connected ? "Disconnect" : "Connect";
    return (
        <Surface className="flex min-h-16 items-center justify-between gap-3 p-4">
            <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#fff] shadow-sm ring-1 ring-[rgba(0,0,0,0.18)]">
                    {logo ? (
                        <img
                            src={logo}
                            alt=""
                            loading="lazy"
                            className="h-7 w-7 object-contain"
                        />
                    ) : (
                        <AppIcon className="h-5 w-5 text-black/50" />
                    )}
                </div>
                <div className="min-w-0">
                    <Text tone="strong" weight="semibold">
                        {name}
                    </Text>
                    {details}
                </div>
            </div>
            <Button
                type="button"
                size="sm"
                intent={connected ? "danger" : "commit"}
                className="inline-flex shrink-0 items-center gap-1.5"
                disabled={pending}
                aria-label={`${actionLabel} ${name}`}
                onClick={onAction}
            >
                {connected ? (
                    <LogOutIcon className="h-4 w-4" />
                ) : (
                    <LogInIcon className="h-4 w-4" />
                )}
                {pending ? `${actionLabel}ing...` : actionLabel}
            </Button>
        </Surface>
    );
}

export function ConnectedApps() {
    const [connections, setConnections] = useState<Connection[]>([]);
    const [toolkits, setToolkits] = useState<Toolkit[]>([]);
    const [search, setSearch] = useState("");
    const [pendingId, setPendingId] = useState<string | null>(null);
    const [connectionsLoading, setConnectionsLoading] = useState(true);
    const [toolkitsLoading, setToolkitsLoading] = useState(true);
    const [connectionsError, setConnectionsError] = useState<string | null>(
        null,
    );
    const [toolkitsError, setToolkitsError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const loadConnections = useCallback(async () => {
        const response = await apiClient.account.integrations.$get();
        if (!response.ok) throw new Error("Could not load connected apps.");
        setConnections(
            ((await response.json()) as { data: Connection[] }).data,
        );
    }, []);

    const loadToolkits = useCallback(async (query = "") => {
        const response = await apiClient.account.integrations.toolkits.$get({
            query: query ? { search: query } : {},
        });
        if (!response.ok) throw new Error("Could not load available apps.");
        return ((await response.json()) as { data: Toolkit[] }).data;
    }, []);

    useEffect(() => {
        void loadConnections()
            .catch((loadError) =>
                setConnectionsError(
                    errorMessage(loadError, "Could not load connected apps."),
                ),
            )
            .finally(() => setConnectionsLoading(false));
    }, [loadConnections]);

    useEffect(() => {
        const query = search.trim();
        let cancelled = false;
        const timeout = window.setTimeout(() => {
            setToolkitsError(null);
            setToolkitsLoading(true);
            void loadToolkits(query)
                .then((results) => {
                    if (cancelled) return;
                    setToolkits(results);
                })
                .catch((searchError) => {
                    if (!cancelled) {
                        setToolkits([]);
                        setToolkitsError(
                            errorMessage(searchError, "Could not search apps."),
                        );
                    }
                })
                .finally(() => {
                    if (!cancelled) setToolkitsLoading(false);
                });
        }, 200);

        return () => {
            cancelled = true;
            window.clearTimeout(timeout);
        };
    }, [loadToolkits, search]);

    async function connect(toolkit: string) {
        setPendingId(toolkit);
        setActionError(null);
        try {
            const response = await apiClient.account.integrations.$post({
                json: { toolkit },
            });
            if (!response.ok) throw new Error("Could not connect this app.");
            window.location.assign(
                ((await response.json()) as { redirectUrl: string })
                    .redirectUrl,
            );
        } catch (connectError) {
            setActionError(
                errorMessage(connectError, "Could not connect this app."),
            );
            setPendingId(null);
        }
    }

    async function disconnect(connection: Connection) {
        setPendingId(connection.id);
        setActionError(null);
        try {
            const response = await apiClient.account.integrations[
                ":id"
            ].$delete({ param: { id: connection.id } });
            if (!response.ok) {
                throw new Error("Could not disconnect this app.");
            }
            setConnections((current) =>
                current.filter(({ id }) => id !== connection.id),
            );
        } catch (disconnectError) {
            setActionError(
                errorMessage(disconnectError, "Could not disconnect this app."),
            );
        } finally {
            setPendingId(null);
        }
    }

    const connectedToolkits = new Set(
        connections.map(({ toolkit }) => toolkit),
    );
    const availableToolkits = toolkits.filter(
        ({ slug }) => !connectedToolkits.has(slug),
    );
    const displayedToolkits = search.trim()
        ? availableToolkits
        : availableToolkits.slice(0, 6);
    const searchQuery = search.trim();
    const normalizedSearch = searchQuery.toLowerCase();
    const displayedConnections = connections.filter((connection) =>
        [connection.name, connection.alias, connection.toolkit]
            .filter(Boolean)
            .some((value) => value?.toLowerCase().includes(normalizedSearch)),
    );

    return (
        <Section title="Connected apps">
            <div className="flex flex-wrap items-center gap-2">
                <div className="catalog-search relative min-w-64 flex-1">
                    <SearchIcon className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-theme-text-muted" />
                    <Input
                        value={search}
                        placeholder="Search apps…"
                        aria-label="Search apps"
                        autoComplete="off"
                        className="w-full pl-9"
                        onChange={(event) =>
                            setSearch(event.currentTarget.value)
                        }
                        onBlur={() => setSearch(search.trim())}
                    />
                </div>
                <InlineLink
                    href="https://composio.dev/toolkits"
                    size="sm"
                    className="shrink-0"
                >
                    Browse all apps
                </InlineLink>
            </div>

            {actionError && <Alert intent="danger">{actionError}</Alert>}
            {connectionsError && (
                <Alert intent="danger">{connectionsError}</Alert>
            )}

            {connectionsLoading && (
                <Text size="sm" tone="muted" role="status">
                    Loading connected apps…
                </Text>
            )}

            {toolkitsError && <Alert intent="danger">{toolkitsError}</Alert>}

            <div className="flex flex-col gap-2" aria-live="polite">
                {!connectionsLoading &&
                    displayedConnections.map((connection) => (
                        <AppCard
                            key={connection.id}
                            name={
                                connection.name ||
                                readableSlug(connection.toolkit)
                            }
                            logo={connection.logo}
                            details={
                                <>
                                    <Text
                                        size="sm"
                                        tone="muted"
                                        className="line-clamp-2"
                                    >
                                        {connection.description ||
                                            toolkits.find(
                                                ({ slug }) =>
                                                    slug === connection.toolkit,
                                            )?.description ||
                                            `Use ${connection.name || readableSlug(connection.toolkit)} with Pollinations agents.`}
                                    </Text>
                                    {connection.alias && (
                                        <Text size="sm" tone="muted">
                                            {connection.alias}
                                        </Text>
                                    )}
                                </>
                            }
                            pending={pendingId === connection.id}
                            onAction={() => void disconnect(connection)}
                            connected
                        />
                    ))}
                {!toolkitsLoading &&
                    !toolkitsError &&
                    displayedToolkits.map((toolkit) => (
                        <AppCard
                            key={toolkit.slug}
                            name={toolkit.name}
                            logo={toolkit.logo}
                            details={
                                <Text
                                    size="sm"
                                    tone="muted"
                                    className="line-clamp-2"
                                >
                                    {toolkit.description}
                                </Text>
                            }
                            pending={pendingId === toolkit.slug}
                            onAction={() => void connect(toolkit.slug)}
                        />
                    ))}
                {!connectionsLoading &&
                    !toolkitsLoading &&
                    !connectionsError &&
                    !toolkitsError &&
                    displayedConnections.length === 0 &&
                    displayedToolkits.length === 0 && (
                        <Text size="sm" tone="muted">
                            {searchQuery
                                ? `No apps found for “${searchQuery}”. Try another search.`
                                : "No more apps to show. Search for another app to connect."}
                        </Text>
                    )}
            </div>

            {toolkitsLoading && (
                <Text size="sm" tone="muted" role="status">
                    {searchQuery ? "Searching apps…" : "Loading apps…"}
                </Text>
            )}

            <footer className="space-y-3">
                <Text
                    size="sm"
                    tone="muted"
                    className="flex items-start gap-1.5"
                >
                    <BotIcon
                        className="mt-0.5 h-4 w-4 shrink-0"
                        aria-hidden="true"
                    />
                    <span>
                        Connect your apps so Pollinations agents can read Gmail,
                        search GitHub, update Sheets, and post to Slack. Enable
                        “Connected Apps” in your agent, then try “Summarize my
                        unread Gmail.” Connections powered by{" "}
                        <InlineLink href="https://composio.dev" size="sm">
                            Composio
                        </InlineLink>
                        .
                    </span>
                </Text>
                <Text
                    size="sm"
                    tone="muted"
                    className="flex items-start gap-1.5"
                >
                    <LockIcon
                        className="mt-0.5 h-4 w-4 shrink-0"
                        aria-hidden="true"
                    />
                    <span>
                        Review the access requested by each app before
                        connecting. Sign-in links expire after 10 minutes. If
                        yours expires or you leave before finishing, select
                        “Connect” again for a fresh link.
                    </span>
                </Text>
            </footer>
        </Section>
    );
}
