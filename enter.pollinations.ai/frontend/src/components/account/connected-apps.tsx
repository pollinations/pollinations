import {
    Button,
    FieldStack,
    Input,
    Section,
    Surface,
    Text,
} from "@pollinations/ui";
import {
    type FormEvent,
    type ReactNode,
    useCallback,
    useEffect,
    useState,
} from "react";
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
    action: ReactNode;
};

function AppCard({ name, logo, details, action }: AppCardProps) {
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
            {action}
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
        setToolkits(((await response.json()) as { data: Toolkit[] }).data);
    }, []);

    useEffect(() => {
        void Promise.all([loadConnections(), loadToolkits()])
            .catch((loadError) =>
                setError(
                    errorMessage(loadError, "Could not load connected apps."),
                ),
            )
            .finally(() => setLoading(false));
    }, [loadConnections, loadToolkits]);

    async function handleSearch(event: FormEvent) {
        event.preventDefault();
        setError(null);
        setLoading(true);
        try {
            await loadToolkits(search.trim());
        } catch (searchError) {
            setError(errorMessage(searchError, "Could not search apps."));
        } finally {
            setLoading(false);
        }
    }

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
        <Section title="Connected apps" framed>
            <Text size="sm" tone="muted">
                Connect apps once, then let your agents use them on your behalf.
                Credentials are handled by Composio and are never shown to the
                agent.
            </Text>

            {connections.map((connection) => {
                const toolkit = toolkits.find(
                    ({ slug }) => slug === connection.toolkit,
                );
                return (
                    <AppCard
                        key={connection.id}
                        name={toolkit?.name || readableSlug(connection.toolkit)}
                        logo={toolkit?.logo || null}
                        details={
                            connection.alias ? (
                                <Text size="sm" tone="muted">
                                    {connection.alias}
                                </Text>
                            ) : undefined
                        }
                        action={
                            <Button
                                type="button"
                                disabled={pendingId === connection.id}
                                onClick={() => void disconnect(connection)}
                            >
                                {pendingId === connection.id
                                    ? "Disconnecting..."
                                    : "Disconnect"}
                            </Button>
                        }
                    />
                );
            })}

            <form
                onSubmit={(event) => void handleSearch(event)}
                className="flex items-end gap-2"
            >
                <FieldStack label="Connect an app" className="min-w-0 flex-1">
                    <Input
                        value={search}
                        placeholder="Search GitHub, Gmail, Slack…"
                        onChange={(event) =>
                            setSearch(event.currentTarget.value)
                        }
                    />
                </FieldStack>
                <Button type="submit" disabled={loading}>
                    Search
                </Button>
            </form>

            {!loading &&
                availableToolkits.map((toolkit) => (
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
                        action={
                            <Button
                                type="button"
                                disabled={pendingId === toolkit.slug}
                                onClick={() => void connect(toolkit.slug)}
                            >
                                {pendingId === toolkit.slug
                                    ? "Connecting..."
                                    : "Connect"}
                            </Button>
                        }
                    />
                ))}

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
