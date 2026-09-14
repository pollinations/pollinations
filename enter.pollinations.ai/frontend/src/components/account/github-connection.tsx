import {
    Alert,
    Button,
    GitHubIcon,
    Section,
    Surface,
    Text,
} from "@pollinations/ui";
import type { InferResponseType } from "hono";
import { useEffect, useState } from "react";
import { apiClient } from "../../api.ts";
import { authClient } from "../../auth.ts";
import { config } from "../../config.ts";

type GitHubStatus = InferResponseType<
    (typeof apiClient)["github-app"]["status"]["$get"],
    200
>;

export function GitHubConnection() {
    const [connection, setConnection] = useState<GitHubStatus | null>(null);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const response = await apiClient["github-app"].status.$get();
                if (!response.ok) throw new Error("Connection check failed");
                const status = await response.json();
                if (!cancelled) setConnection(status);
            } catch {
                if (!cancelled) {
                    setError(
                        "Could not check GitHub connection. Refresh to try again.",
                    );
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    async function disconnect(): Promise<void> {
        setPending(true);
        setError(null);
        try {
            const result = await authClient.unlinkAccount({
                providerId: "github-app",
            });
            if (result.error) throw result.error;
            setConnection((current) =>
                current
                    ? {
                          configured: current.configured,
                          connected: false,
                          authorized: false,
                          login: null,
                          installationCount: 0,
                          repositorySelection: null,
                          manageUrl: null,
                      }
                    : current,
            );
        } catch {
            setError("Could not disconnect GitHub.");
        } finally {
            setPending(false);
        }
    }

    let status = error ? "Connection unavailable" : "Checking connection...";
    if (connection) {
        if (!connection.configured) {
            status = "GitHub repository connections are not available yet.";
        } else if (connection.connected) {
            status = `@${connection.login} · Connected`;
        } else if (connection.authorized) {
            status = "Select repositories on GitHub to finish connecting.";
        } else {
            status = "Not connected";
        }
    }

    let actionLabel = "Connect GitHub";
    let actionUrl = `${config.apiBaseUrl}/github-app/authorize`;
    if (connection?.authorized) {
        actionLabel = "Select repositories";
        actionUrl = `${config.apiBaseUrl}/github-app/install`;
        if (connection.connected && connection.manageUrl) {
            actionLabel = "Manage on GitHub";
            actionUrl = connection.manageUrl;
        }
    }

    return (
        <div id="github" className="scroll-mt-6">
            <Section title="GitHub" framed>
                <Text size="sm" tone="muted">
                    Read-only access to repositories you choose with the GitHub
                    MCP. Use with a secret key or an agent started with one.
                </Text>
                <Surface
                    variant="card"
                    className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                >
                    <div className="flex items-center gap-3">
                        <GitHubIcon className="h-6 w-6 shrink-0" />
                        <div>
                            <Text tone="strong" weight="semibold">
                                Repository access
                            </Text>
                            <Text size="sm" tone="muted" role="status">
                                {status}
                            </Text>
                        </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2 self-start sm:self-center">
                        <Button
                            type="button"
                            disabled={!connection?.configured || pending}
                            onClick={() => window.location.assign(actionUrl)}
                        >
                            {actionLabel}
                        </Button>
                        {connection?.authorized && (
                            <Button
                                type="button"
                                disabled={pending}
                                onClick={() => void disconnect()}
                            >
                                {pending ? "Disconnecting..." : "Disconnect"}
                            </Button>
                        )}
                    </div>
                </Surface>
                {error && <Alert intent="danger">{error}</Alert>}
            </Section>
        </div>
    );
}
