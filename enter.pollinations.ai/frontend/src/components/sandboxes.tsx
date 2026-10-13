import {
    Alert,
    Button,
    ButtonGroup,
    Chip,
    ConfirmationDialog,
    CopyField,
    InlineLink,
    Input,
    PauseIcon,
    PlayIcon,
    PlusIcon,
    RefreshIcon,
    Section,
    Surface,
    TabButton,
    Text,
    TrashIcon,
} from "@pollinations/ui";
import { useCallback, useEffect, useState } from "react";
import { genFetch } from "../api.ts";
import { ResourceConfirmationContent } from "./community-endpoints/resource-confirmation-content.tsx";
import { readError } from "./community-endpoints/types.ts";
import { LoadError, SectionContent } from "./layout/dashboard-loading.tsx";

// Gen serves E2B's API here and keeps the sandbox rules and billing.
const E2B_PATH = "/alpha/e2b";

type Size = { cpuCount: number; memoryMB: number };

type Sandbox = Size & {
    sandboxID: string;
    templateID: string;
    alias?: string;
    state: "running" | "paused";
    // When its current run started: at the create or the last resume.
    startedAt: string;
    // When a running sandbox's paid time ends, or when a paused one paused.
    endAt: string;
};

type Pricing = {
    maxRunning: number;
    maxRunSeconds: number;
    vcpuSecond: number;
    gibSecond: number;
    templates: Record<string, Size>;
};

// Time paid up front by a create, a resume or more time: polli's 10 minutes,
// or up to E2B's 24-hour run.
const LEASES = [
    { label: "10 min", seconds: 600 },
    { label: "1 hour", seconds: 3600 },
    { label: "8 hours", seconds: 8 * 3600 },
    { label: "24 hours", seconds: 24 * 3600 },
];

type Pending =
    | { action: "create"; template: string }
    | { action: "connect"; sandbox: Sandbox }
    | { action: "kill"; sandbox: Sandbox };

async function e2b<T>(path: string, method = "GET", body?: unknown) {
    const response = await genFetch(`${E2B_PATH}${path}`, { method, body });
    if (!response.ok) throw new Error(await readError(response));
    // Pause and kill answer 204 with no body.
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
}

const perSecond = (pricing: Pricing, size: Size) =>
    size.cpuCount * pricing.vcpuSecond +
    (size.memoryMB / 1024) * pricing.gibSecond;

const pollen = (amount: number) => `${Number(amount.toPrecision(2))} Pollen`;

const sizeLabel = ({ cpuCount, memoryMB }: Size) =>
    `${cpuCount} vCPU, ${memoryMB / 1024} GB`;

// Add time adds to a running sandbox's paid time, up to the end of its run:
// E2B ends a run 24 hours after the create or resume, and gen charges nothing
// past that.
function addTimeLeases(pricing: Pricing, sandbox: Sandbox) {
    const room =
        Date.parse(sandbox.startedAt) +
        pricing.maxRunSeconds * 1000 -
        Date.parse(sandbox.endAt);
    return LEASES.filter(({ seconds }) => seconds * 1000 <= room);
}

// What the pending action pays up front, or why it can't be known yet.
function upFront(pricing: Pricing, pending: Pending, seconds: number) {
    if (pending.action === "create") {
        const size = pricing.templates[pending.template];
        if (!size) {
            return `${pollen(pricing.vcpuSecond * 3600)} per vCPU-hour and ${pollen(pricing.gibSecond * 3600)} per GB-hour, depending on the template’s size`;
        }
        return `${pollen(perSecond(pricing, size) * seconds)} (${sizeLabel(size)})`;
    }
    return pollen(perSecond(pricing, pending.sandbox) * seconds);
}

function SandboxCard({
    sandbox,
    pricing,
    busy,
    onConnect,
    onPause,
    onKill,
}: {
    sandbox: Sandbox;
    pricing: Pricing;
    busy: boolean;
    onConnect: () => void;
    onPause: () => void;
    onKill: () => void;
}) {
    const running = sandbox.state === "running";
    const paidToRunEnd = running && !addTimeLeases(pricing, sandbox).length;
    return (
        <Surface className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                    <Text
                        tone="strong"
                        weight="semibold"
                        className="break-all font-mono"
                    >
                        {sandbox.sandboxID}
                    </Text>
                    <Text size="sm" tone="muted">
                        {sandbox.alias ?? sandbox.templateID} ·{" "}
                        {sizeLabel(sandbox)} ·{" "}
                        {pollen(perSecond(pricing, sandbox) * 3600)} an hour
                        while running
                    </Text>
                </div>
                <Chip intent={running ? "success" : "neutral"} size="md">
                    {running
                        ? `Paid until ${new Date(sandbox.endAt).toLocaleString()}`
                        : "Paused"}
                </Chip>
            </div>
            <CopyField
                label={`Copy ssh command for ${sandbox.sandboxID}`}
                value={`ssh ${sandbox.sandboxID}.polli`}
            />
            <ButtonGroup>
                <Button
                    size="sm"
                    intent="commit"
                    icon={running ? <PlusIcon /> : <PlayIcon />}
                    disabled={busy || paidToRunEnd}
                    title={
                        paidToRunEnd
                            ? "Paid up to the end of its 24-hour run. Pause and resume it to start a new run."
                            : undefined
                    }
                    onClick={onConnect}
                >
                    {running ? "Add time" : "Resume"}
                </Button>
                {running && (
                    <Button
                        size="sm"
                        icon={<PauseIcon />}
                        disabled={busy}
                        onClick={onPause}
                    >
                        Pause
                    </Button>
                )}
                <Button
                    size="sm"
                    intent="danger"
                    icon={<TrashIcon />}
                    disabled={busy}
                    onClick={onKill}
                >
                    Kill
                </Button>
            </ButtonGroup>
        </Surface>
    );
}

export function Sandboxes() {
    const [pricing, setPricing] = useState<Pricing>();
    const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [template, setTemplate] = useState("pollinations");
    const [pending, setPending] = useState<Pending | null>(null);
    const [lease, setLease] = useState(LEASES[0].seconds);

    const load = useCallback(async () => {
        setLoadError(null);
        try {
            const [prices, list] = await Promise.all([
                e2b<Pricing>("/pricing"),
                e2b<Sandbox[]>("/v2/sandboxes"),
            ]);
            setPricing(prices);
            setSandboxes(list);
        } catch (error) {
            setLoadError(
                error instanceof Error
                    ? error.message
                    : "Couldn’t load sandboxes.",
            );
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    async function run(id: string, action: () => Promise<unknown>) {
        setPending(null);
        setBusyId(id);
        setActionError(null);
        try {
            await action();
        } catch (error) {
            setActionError(
                error instanceof Error ? error.message : "Request failed.",
            );
        } finally {
            setBusyId(null);
            await load();
        }
    }

    // Create and resume start a new run; Add time stays within the current one.
    const addTo =
        pending?.action === "connect" && pending.sandbox.state === "running"
            ? pending.sandbox
            : null;
    const leases = pricing && addTo ? addTimeLeases(pricing, addTo) : LEASES;
    const seconds = leases.some((option) => option.seconds === lease)
        ? lease
        : (leases[0]?.seconds ?? 0);

    function confirm() {
        if (!pending) return;
        if (pending.action === "create") {
            // The same request as `polli sandbox create`.
            void run("new", () =>
                e2b("/sandboxes", "POST", {
                    templateID: pending.template,
                    timeout: seconds,
                    autoPause: true,
                }),
            );
            return;
        }
        const id = pending.sandbox.sandboxID;
        // Connect sets the lease from now, so Add time counts the paid time
        // left. Unlike timeout, connect leaves a keep set from the CLI.
        const timeout = addTo
            ? Math.ceil((Date.parse(addTo.endAt) - Date.now()) / 1000) + seconds
            : seconds;
        void run(id, () =>
            pending.action === "kill"
                ? e2b(`/sandboxes/${id}`, "DELETE")
                : e2b(`/sandboxes/${id}/connect`, "POST", { timeout }),
        );
    }

    const loading = !pricing && !loadError;
    const running = sandboxes.filter((s) => s.state === "running").length;
    const full = !!pricing && running >= pricing.maxRunning;
    const spends = pending && pending.action !== "kill";

    return (
        <Section
            title="Sandboxes"
            action={
                <Button
                    size="sm"
                    icon={<RefreshIcon />}
                    disabled={loading}
                    onClick={() => void load()}
                >
                    Refresh
                </Button>
            }
        >
            {loadError && <LoadError onRetry={load}>{loadError}</LoadError>}
            {actionError && (
                <Alert intent="danger">
                    {actionError}
                    {/top.up/i.test(actionError) && (
                        <>
                            {" "}
                            <InlineLink href="/pollen">Go to Pollen</InlineLink>
                        </>
                    )}
                </Alert>
            )}
            <SectionContent loading={loading}>
                {pricing && (
                    <div className="flex flex-col gap-3">
                        <form
                            className="flex flex-wrap items-end gap-2"
                            onSubmit={(event) => {
                                event.preventDefault();
                                setPending({
                                    action: "create",
                                    template: template.trim(),
                                });
                            }}
                        >
                            <div className="flex min-w-48 flex-1 flex-col gap-1">
                                <label
                                    htmlFor="sandbox-template"
                                    className="text-sm text-theme-text-muted"
                                >
                                    Template
                                </label>
                                <Input
                                    id="sandbox-template"
                                    value={template}
                                    list="sandbox-templates"
                                    required
                                    onChange={(event) =>
                                        setTemplate(event.currentTarget.value)
                                    }
                                />
                                <datalist id="sandbox-templates">
                                    {Object.keys(pricing.templates).map(
                                        (id) => (
                                            <option key={id} value={id} />
                                        ),
                                    )}
                                </datalist>
                            </div>
                            <Button
                                type="submit"
                                intent="commit"
                                icon={<PlusIcon />}
                                disabled={full || busyId === "new"}
                            >
                                {busyId === "new"
                                    ? "Creating…"
                                    : "Create sandbox"}
                            </Button>
                        </form>
                        <Text size="sm" tone={full ? "strong" : "muted"}>
                            {running} of {pricing.maxRunning} running at once.{" "}
                            {full
                                ? "Pause or kill one to start or resume another."
                                : "Paused sandboxes don’t count and cost nothing."}
                        </Text>
                        <div className="flex flex-col gap-2" aria-live="polite">
                            {sandboxes.map((sandbox) => (
                                <SandboxCard
                                    key={sandbox.sandboxID}
                                    sandbox={sandbox}
                                    pricing={pricing}
                                    busy={busyId === sandbox.sandboxID}
                                    onConnect={() =>
                                        setPending({
                                            action: "connect",
                                            sandbox,
                                        })
                                    }
                                    onPause={() =>
                                        void run(sandbox.sandboxID, () =>
                                            e2b(
                                                `/sandboxes/${sandbox.sandboxID}/pause`,
                                                "POST",
                                            ),
                                        )
                                    }
                                    onKill={() =>
                                        setPending({ action: "kill", sandbox })
                                    }
                                />
                            ))}
                            {!sandboxes.length && (
                                <Text size="sm" tone="muted">
                                    No sandboxes yet.
                                </Text>
                            )}
                        </div>
                    </div>
                )}
            </SectionContent>
            <Text size="sm" tone="muted">
                Sandbox time is paid in advance from your Pollen and isn’t
                refunded when you pause or kill a sandbox early. A sandbox
                pauses when its paid time ends; paused ones keep their files and
                cost nothing. To ssh in, install polli (
                <code>npm i -g @pollinations/cli</code>), run{" "}
                <code>polli auth login</code> and{" "}
                <code>polli sandbox ssh-config</code> once. ssh resumes a paused
                sandbox and pays 10 minutes at a time while connected.
            </Text>

            <ConfirmationDialog
                open={!!pending}
                title={
                    !pending
                        ? ""
                        : pending.action === "create"
                          ? "Create sandbox?"
                          : pending.action === "kill"
                            ? "Kill sandbox?"
                            : pending.sandbox.state === "running"
                              ? "Add time?"
                              : "Resume sandbox?"
                }
                intent={spends ? "commit" : "danger"}
                confirmIcon={spends ? <PlayIcon /> : undefined}
                confirmLabel={
                    pending?.action === "kill" ? "Kill" : "Pay and continue"
                }
                onConfirm={confirm}
                onCancel={() => setPending(null)}
            >
                {pending?.action === "kill" && (
                    <ResourceConfirmationContent
                        resource={pending.sandbox.sandboxID}
                    >
                        This deletes the sandbox and its files and can’t be
                        undone. Its paid time isn’t refunded.
                    </ResourceConfirmationContent>
                )}
                {spends && pricing && (
                    <>
                        <ResourceConfirmationContent
                            resource={
                                pending.action === "create"
                                    ? pending.template
                                    : pending.sandbox.sandboxID
                            }
                        >
                            {addTo ? "Add" : "Keep it running for"}
                        </ResourceConfirmationContent>
                        <ButtonGroup>
                            {leases.map((option) => (
                                <TabButton
                                    key={option.seconds}
                                    size="sm"
                                    active={seconds === option.seconds}
                                    onClick={() => setLease(option.seconds)}
                                >
                                    {option.label}
                                </TabButton>
                            ))}
                        </ButtonGroup>
                        <Alert intent="warning">
                            This spends Pollen now:{" "}
                            {upFront(pricing, pending, seconds)}. Paid in
                            advance, not refunded.
                        </Alert>
                    </>
                )}
            </ConfirmationDialog>
        </Section>
    );
}
