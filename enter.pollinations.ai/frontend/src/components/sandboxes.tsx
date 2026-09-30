import {
    Alert,
    Button,
    ConfirmationDialog,
    CopyField,
    InlineLink,
    Input,
    Section,
    Surface,
    Text,
} from "@pollinations/ui";
import { useCallback, useEffect, useState } from "react";
import { config } from "../config.ts";
import { LoadError, SectionContent } from "./layout/dashboard-loading.tsx";

type Sandbox = {
    sandboxID: string;
    templateID: string;
    alias?: string;
    state: string;
    cpuCount: number;
    memoryMB: number;
    endAt: string;
};

// Gen's E2B API, reached through enter with the dashboard session.
async function e2b<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${config.apiBaseUrl}/e2b${path}`, {
        ...init,
        credentials: "include",
    });
    if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
            message?: string;
        } | null;
        throw new Error(body?.message || `Request failed (${response.status})`);
    }
    return (response.status === 204 ? undefined : await response.json()) as T;
}

const errorMessage = (error: unknown) =>
    error instanceof Error ? error.message : "Something went wrong.";

export function Sandboxes() {
    const [sandboxes, setSandboxes] = useState<Sandbox[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [template, setTemplate] = useState("base");
    const [pending, setPending] = useState<string | null>(null);
    const [killing, setKilling] = useState<Sandbox | null>(null);

    const load = useCallback(async () => {
        setLoadError(null);
        try {
            setSandboxes(await e2b<Sandbox[]>("/v2/sandboxes"));
        } catch (error) {
            setLoadError(errorMessage(error));
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    async function run(id: string, action: () => Promise<unknown>) {
        setPending(id);
        setActionError(null);
        try {
            await action();
            await load();
        } catch (error) {
            setActionError(errorMessage(error));
        } finally {
            setPending(null);
        }
    }

    const create = () =>
        run("create", () =>
            e2b("/v2/sandboxes", {
                method: "POST",
                // Same lease as `polli sandbox create`: 10 paid minutes, then
                // paused until the next ssh session resumes it.
                body: JSON.stringify({
                    templateID: template.trim(),
                    timeout: 600,
                    autoPause: true,
                }),
            }),
        );

    const kill = (sandbox: Sandbox) =>
        run(sandbox.sandboxID, () =>
            e2b(`/sandboxes/${sandbox.sandboxID}`, { method: "DELETE" }),
        );

    return (
        <Section
            title="Sandboxes (alpha)"
            intro={
                <>
                    Linux VMs paid from your wallet in 10-minute blocks. They
                    pause when idle and resume on the next ssh. Run{" "}
                    <code>polli sandbox ssh-config</code> once to connect.{" "}
                    <InlineLink href="https://gen.pollinations.ai/docs#tag/sandboxes">
                        Docs
                    </InlineLink>
                </>
            }
        >
            <form
                className="flex flex-wrap gap-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    void create();
                }}
            >
                <Input
                    value={template}
                    aria-label="E2B template"
                    className="min-w-48 flex-1"
                    onChange={(event) => setTemplate(event.currentTarget.value)}
                />
                <Button
                    type="submit"
                    intent="commit"
                    disabled={pending !== null || !template.trim()}
                >
                    {pending === "create" ? "Creating..." : "Create sandbox"}
                </Button>
            </form>

            {actionError && <Alert intent="danger">{actionError}</Alert>}
            {loadError && <LoadError onRetry={load}>{loadError}</LoadError>}

            <SectionContent loading={!sandboxes && !loadError}>
                <div className="flex flex-col gap-2" aria-live="polite">
                    {sandboxes?.map((sandbox) => (
                        <Surface
                            key={sandbox.sandboxID}
                            className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
                        >
                            <div className="min-w-0 flex-1 space-y-2">
                                <Text size="sm" tone="muted">
                                    {sandbox.alias ?? sandbox.templateID} ·{" "}
                                    {sandbox.cpuCount} vCPU, {sandbox.memoryMB}{" "}
                                    MB ·{" "}
                                    {sandbox.state === "running"
                                        ? `running until ${new Date(sandbox.endAt).toLocaleTimeString()}`
                                        : sandbox.state}
                                </Text>
                                <CopyField
                                    label={`Copy ssh command for ${sandbox.sandboxID}`}
                                    value={`ssh ${sandbox.sandboxID}.polli`}
                                />
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                intent="danger"
                                disabled={pending !== null}
                                onClick={() => setKilling(sandbox)}
                            >
                                {pending === sandbox.sandboxID
                                    ? "Killing..."
                                    : "Kill"}
                            </Button>
                        </Surface>
                    ))}
                    {sandboxes?.length === 0 && (
                        <Text size="sm" tone="muted">
                            No sandboxes yet.
                        </Text>
                    )}
                </div>
            </SectionContent>

            <ConfirmationDialog
                open={!!killing}
                title="Kill sandbox?"
                description={`${killing?.sandboxID} is deleted with its files. This cannot be undone.`}
                confirmLabel="Kill"
                onConfirm={() => {
                    if (killing) void kill(killing);
                    setKilling(null);
                }}
                onCancel={() => setKilling(null)}
            />
        </Section>
    );
}
