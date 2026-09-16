import {
    Alert,
    AppIcon,
    Button,
    CheckIcon,
    ExternalLinkButton,
    InlineLink,
    Input,
    LockIcon,
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
    actionLabel: string;
    pendingLabel: string;
    pending: boolean;
    onAction: () => void;
    connected?: boolean;
};

function AppCard({
    name,
    logo,
    details,
    actionLabel,
    pendingLabel,
    pending,
    onAction,
    connected = false,
}: AppCardProps) {
    return (
        <Surface
            variant="card"
            className={`flex h-full justify-between gap-3 ${
                connected ? "items-center" : "min-h-24 items-start"
            }`}
        >
            <div
                className={`flex min-w-0 gap-3 ${
                    connected ? "items-center" : "items-start"
                }`}
            >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#fff] shadow-sm ring-1 ring-[rgba(0,0,0,0.18)]">
                    {logo ? (
                        <img
                            src={logo}
                            alt=""
                            loading="lazy"
                            className="h-7 w-7 object-contain drop-shadow-sm"
                        />
                    ) : (
                        <AppIcon className="h-5 w-5 text-black/50" />
                    )}
                </div>
                <div
                    className={
                        connected
                            ? "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"
                            : "min-w-0"
                    }
                >
                    <Text tone="strong" weight="semibold">
                        {name}
                    </Text>
                    {connected && details}
                    {connected ? (
                        <div className="flex items-center gap-1.5">
                            <CheckIcon className="h-3.5 w-3.5 shrink-0 text-intent-success-text" />
                            <Text size="sm" tone="muted">
                                Ready to use
                            </Text>
                        </div>
                    ) : (
                        details
                    )}
                </div>
            </div>
            <Button
                type="button"
                size="sm"
                intent={connected ? "danger" : undefined}
                className={`shrink-0 ${
                    connected ? "self-center" : "self-start"
                }`}
                disabled={pending}
                aria-label={`${actionLabel} ${name}`}
                onClick={onAction}
            >
                {pending ? pendingLabel : actionLabel}
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

    return (
        <Section title="Connect apps" framed>
            <Text>
                Let Pollinations agents work with the apps you already use.
            </Text>

            {actionError && <Alert intent="danger">{actionError}</Alert>}
            {connectionsError && (
                <Alert intent="danger">{connectionsError}</Alert>
            )}

            {connectionsLoading && (
                <Text size="sm" tone="muted" role="status">
                    Loading connected apps…
                </Text>
            )}

            {!connectionsLoading && connections.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                        <Text tone="strong" weight="semibold">
                            Connected
                        </Text>
                        <Text size="sm" tone="muted">
                            {connections.length}{" "}
                            {connections.length === 1 ? "app" : "apps"}
                        </Text>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {connections.map((connection) => (
                            <AppCard
                                key={connection.id}
                                name={
                                    connection.name ||
                                    readableSlug(connection.toolkit)
                                }
                                logo={connection.logo}
                                details={
                                    connection.alias ? (
                                        <Text size="sm" tone="muted">
                                            {connection.alias}
                                        </Text>
                                    ) : undefined
                                }
                                actionLabel="Disconnect"
                                pendingLabel="Disconnecting..."
                                pending={pendingId === connection.id}
                                onAction={() => void disconnect(connection)}
                                connected
                            />
                        ))}
                    </div>
                </div>
            )}

            <div className="space-y-3">
                <Text tone="strong" weight="semibold">
                    Available
                </Text>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-64 max-w-lg flex-1">
                        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-theme-text-muted" />
                        <Input
                            value={search}
                            placeholder="Search apps…"
                            aria-label="Search available apps"
                            autoComplete="off"
                            className="w-full pl-9"
                            onChange={(event) =>
                                setSearch(event.currentTarget.value)
                            }
                            onBlur={() => setSearch(search.trim())}
                        />
                    </div>
                    <ExternalLinkButton
                        href="https://composio.dev/toolkits"
                        className="shrink-0"
                    >
                        Browse all apps
                    </ExternalLinkButton>
                </div>
            </div>

            {toolkitsError && <Alert intent="danger">{toolkitsError}</Alert>}

            {!toolkitsLoading && !toolkitsError && (
                <div aria-live="polite">
                    {displayedToolkits.length > 0 ? (
                        <div className="space-y-3">
                            <div className="grid items-stretch gap-2 sm:grid-cols-2">
                                {displayedToolkits.map((toolkit) => (
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
                                        actionLabel="Connect"
                                        pendingLabel="Connecting..."
                                        pending={pendingId === toolkit.slug}
                                        onAction={() =>
                                            void connect(toolkit.slug)
                                        }
                                    />
                                ))}
                            </div>
                        </div>
                    ) : (
                        <Text size="sm" tone="muted">
                            {searchQuery
                                ? `No apps found for “${searchQuery}”. Try another search.`
                                : "No more apps to show. Search for another app to connect."}
                        </Text>
                    )}
                </div>
            )}

            {toolkitsLoading && (
                <Text size="sm" tone="muted" role="status">
                    {searchQuery ? "Searching apps…" : "Loading apps…"}
                </Text>
            )}

            <p className="mt-4 flex items-start gap-1.5 border-t border-divider pt-4 text-[13px] leading-snug text-theme-text-muted">
                <LockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="space-y-0.5">
                    <span className="block">
                        Review the access requested by each app before
                        connecting.
                    </span>
                    <span className="block text-theme-text-soft">
                        Connections powered by{" "}
                        <InlineLink href="https://composio.dev">
                            Composio
                        </InlineLink>
                    </span>
                </span>
            </p>
        </Section>
    );
}
