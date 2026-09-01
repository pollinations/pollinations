import {
    Button,
    InlineLink,
    Input,
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
};

function AppCard({
    name,
    logo,
    details,
    actionLabel,
    pendingLabel,
    pending,
    onAction,
}: AppCardProps) {
    return (
        <Surface
            variant="card"
            className="flex items-center justify-between gap-3"
        >
            <div className="flex min-w-0 items-center gap-3">
                {logo && (
                    <img
                        src={logo}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-md"
                    />
                )}
                <div className="min-w-0">
                    <Text tone="strong" weight="semibold">
                        {name}
                    </Text>
                    {details}
                </div>
            </div>
            <Button type="button" disabled={pending} onClick={onAction}>
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
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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
        void loadConnections().catch((loadError) =>
            setError(errorMessage(loadError, "Could not load connected apps.")),
        );
    }, [loadConnections]);

    useEffect(() => {
        const query = search.trim();
        let cancelled = false;
        const timeout = window.setTimeout(() => {
            setError(null);
            setLoading(true);
            void loadToolkits(query)
                .then((results) => {
                    if (!cancelled) setToolkits(results);
                })
                .catch((searchError) => {
                    if (!cancelled) {
                        setError(
                            errorMessage(searchError, "Could not search apps."),
                        );
                    }
                })
                .finally(() => {
                    if (!cancelled) setLoading(false);
                });
        }, 200);

        return () => {
            cancelled = true;
            window.clearTimeout(timeout);
        };
    }, [loadToolkits, search]);

    async function connect(toolkit: string) {
        setPendingId(toolkit);
        setError(null);
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
            setError(errorMessage(connectError, "Could not connect this app."));
            setPendingId(null);
        }
    }

    async function disconnect(connection: Connection) {
        setPendingId(connection.id);
        setError(null);
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
            setError(
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

    return (
        <Section title="Connectors" framed>
            <Text size="sm" tone="muted">
                Agents can show you a sign-in link when they need access to an
                app. You can also connect one here first. Composio stores the
                credentials; agents never see them.
            </Text>

            {connections.length > 0 && (
                <div className="space-y-2">
                    <Text tone="strong" weight="semibold">
                        Connected
                    </Text>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {connections.map((connection) => {
                            const toolkit = toolkits.find(
                                ({ slug }) => slug === connection.toolkit,
                            );
                            return (
                                <AppCard
                                    key={connection.id}
                                    name={
                                        toolkit?.name ||
                                        readableSlug(connection.toolkit)
                                    }
                                    logo={toolkit?.logo || null}
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
                                />
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <Text tone="strong" weight="semibold">
                        Add
                    </Text>
                    <InlineLink href="https://composio.dev/toolkits">
                        View all connectors
                    </InlineLink>
                </div>
                <div className="relative max-w-md">
                    <SearchIcon className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-theme-text-muted" />
                    <Input
                        value={search}
                        placeholder="Search connectors…"
                        aria-label="Search connectors"
                        autoComplete="off"
                        className="pl-9"
                        onChange={(event) =>
                            setSearch(event.currentTarget.value)
                        }
                        onBlur={() => setSearch(search.trim())}
                    />
                </div>
            </div>

            {!loading && (
                <div>
                    {availableToolkits.length > 0 ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                            {availableToolkits.map((toolkit) => (
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
                                    onAction={() => void connect(toolkit.slug)}
                                />
                            ))}
                        </div>
                    ) : (
                        <Text size="sm" tone="muted">
                            No connectors found. Try another search.
                        </Text>
                    )}
                </div>
            )}

            {loading && (
                <Text size="sm" tone="muted">
                    Loading apps...
                </Text>
            )}
            {error && (
                <Text size="sm" tone="muted">
                    {error}
                </Text>
            )}
        </Section>
    );
}
