import {
    Alert,
    RocketIcon,
    Section,
    Surface,
    TokensIcon,
} from "@pollinations/ui";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../api.ts";
import { AppCard } from "./app-card.tsx";
import { AppDeleteConfirmation } from "./app-delete-confirmation.tsx";
import { readError, type UserApp } from "./types.ts";

export function Apps() {
    const [apps, setApps] = useState<UserApp[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<UserApp | null>(null);

    const loadApps = useCallback(async (): Promise<void> => {
        setError(null);
        const response = await apiClient.account.apps.$get();
        if (!response.ok) {
            setError(await readError(response));
            setIsLoading(false);
            return;
        }
        const body = (await response.json()) as { data: UserApp[] };
        setApps(body.data);
        setIsLoading(false);
    }, []);

    useEffect(() => {
        void loadApps();
    }, [loadApps]);

    async function handleDelete(): Promise<void> {
        if (!deleting) return;
        const target = deleting;
        setDeleting(null);
        setError(null);
        try {
            const response = await apiClient.account.apps[":id"].$delete({
                param: { id: target.id },
            });
            if (!response.ok) throw new Error(await readError(response));
            await loadApps();
        } catch (thrown) {
            setError(
                thrown instanceof Error ? thrown.message : "App delete failed",
            );
        }
    }

    return (
        <>
            <Section title="My Apps" framed>
                {error && (
                    <Alert intent="danger" className="mb-3">
                        {error}
                    </Alert>
                )}
                <div className="flex flex-col gap-3">
                    {isLoading ? (
                        <Surface className="p-6 text-center text-sm text-theme-text-muted">
                            Loading…
                        </Surface>
                    ) : apps.length === 0 ? (
                        <Surface className="p-6 text-center">
                            <RocketIcon className="mx-auto mb-2 h-8 w-8 text-theme-text-muted" />
                            <p className="mb-2 text-lg font-semibold">
                                Deploy your first app
                            </p>
                            <p className="text-sm text-theme-text-muted">
                                Ship a static site to a{" "}
                                <strong>pollinations.ai</strong> subdomain with{" "}
                                <span className="font-mono">
                                    polli apps deploy ./dist --slug my-app
                                </span>
                                .
                            </p>
                        </Surface>
                    ) : (
                        apps.map((app) => (
                            <AppCard
                                key={app.id}
                                app={app}
                                onDelete={() => setDeleting(app)}
                            />
                        ))
                    )}
                </div>
                <p className="mt-4 flex items-start gap-1.5 border-t border-divider pt-4 text-[13px] leading-snug text-theme-text-muted">
                    <TokensIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                        Deploy and update apps with the <strong>polli</strong>{" "}
                        CLI (<span className="font-mono">apps deploy</span>) or
                        the Apps API. Each app is served at{" "}
                        <span className="font-mono">
                            &lt;slug&gt;.pollinations.ai
                        </span>
                        .
                    </span>
                </p>
            </Section>

            <AppDeleteConfirmation
                app={deleting}
                onConfirm={() => void handleDelete()}
                onCancel={() => setDeleting(null)}
            />
        </>
    );
}
