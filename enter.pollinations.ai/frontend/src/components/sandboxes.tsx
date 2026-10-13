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
    // Not E2B's: when gen keeps it running until, paying an hour at a time.
    keptUntil?: string;
};

type Pricing = {
    maxRunning: number;
    maxRunSeconds: number;
    vcpuSecond: number;
    gibSecond: number;
    templates: Record<string, Size>;
};

// E2B's longest timeout, about 68 years: gen keeps the sandbox running until
// it's paused or killed.
const FOREVER = 2 ** 31 - 1;

// How long a create, a resume or more time runs the sandbox for: at least 10
// minutes, or until it's stopped. Up to the end of E2B's 24-hour run it's paid
// up front; past it, gen keeps the sandbox running and pays an hour at a time.
const UNITS = [
    { label: "minutes", seconds: 60 },
    { label: "hours", seconds: 3600 },
    { label: "days", seconds: 86_400 },
];

// What E2B accepts: `name`, `name:tag` or `team/name:tag`.
const TEMPLATE_NAME = /^([a-z0-9_-]+\/)?[a-z0-9_-]+(:[a-z0-9._-]+)?$/;

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

// Past half of E2B's longest timeout, it runs until it's stopped.
const forever = (until: string) =>
    Date.parse(until) - Date.now() > FOREVER * 500;

function customError(seconds: number) {
    if (!(seconds > 0)) return "Enter how long, e.g. 2 hours.";
    if (seconds < 600) return "At least 10 minutes.";
    if (seconds > FOREVER) return "That’s longer than Until I stop it.";
    return null;
}

// What the pending action costs for that many seconds, or per vCPU and GB
// when the template's size isn't known.
function upFront(pricing: Pricing, pending: Pending, seconds: number) {
    if (pending.action === "create") {
        const size = pricing.templates[pending.template];
        if (!size) {
            return `${pollen(pricing.vcpuSecond * seconds)} per vCPU and ${pollen(pricing.gibSecond * seconds)} per GB, depending on the template’s size`;
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
    const kept = running ? sandbox.keptUntil : undefined;
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
                    {!running
                        ? "Paused"
                        : kept && forever(kept)
                          ? "Runs until you stop it"
                          : `Runs until ${new Date(kept ?? sandbox.endAt).toLocaleString()}`}
                </Chip>
            </div>
            <CopyField
                label={`Copy ssh command for ${sandbox.sandboxID}`}
                value={`ssh ${sandbox.sandboxID}.polli`}
            />
            <ButtonGroup>
                {!(kept && forever(kept)) && (
                    <Button
                        size="sm"
                        intent="commit"
                        icon={running ? <PlusIcon /> : <PlayIcon />}
                        disabled={busy}
                        onClick={onConnect}
                    >
                        {running ? "Add time" : "Resume"}
                    </Button>
                )}
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
    const [amount, setAmount] = useState("1");
    const [unit, setUnit] = useState(3600);
    const [untilStopped, setUntilStopped] = useState(false);

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

    const templateError =
        template.trim() && !TEMPLATE_NAME.test(template.trim())
            ? "Not a template name. Use lowercase letters, digits, - and _, e.g. claude or team/name:tag."
            : null;

    const seconds = untilStopped ? FOREVER : Math.round(Number(amount) * unit);
    const durationError = untilStopped ? null : customError(seconds);
    // Create and resume run from now and start a new run; Add time adds to
    // the time a running sandbox already runs for.
    const addTo =
        pending?.action === "connect" && pending.sandbox.state === "running"
            ? pending.sandbox
            : null;
    const now = Date.now();
    const from = addTo ? Date.parse(addTo.keptUntil ?? addTo.endAt) : now;
    const timeout = Math.min(FOREVER, Math.ceil((from - now) / 1000) + seconds);
    const runEnd =
        (addTo ? Date.parse(addTo.startedAt) : now) +
        (pricing?.maxRunSeconds ?? 0) * 1000;
    // Past the end of the run, gen keeps it running an hour at a time.
    const kept = now + timeout * 1000 > runEnd;
    const paidNow =
        timeout -
        (addTo ? Math.max(0, Date.parse(addTo.endAt) - now) / 1000 : 0);

    function confirm() {
        if (!pending) return;
        if (pending.action === "create") {
            // The same request as `polli sandbox create`.
            void run("new", () =>
                e2b("/sandboxes", "POST", {
                    templateID: pending.template,
                    timeout,
                    autoPause: true,
                }).catch((error: Error) => {
                    throw /not found/i.test(error.message)
                        ? new Error(
                              `There’s no public template “${pending.template}”. Check the name, or start with pollinations.`,
                          )
                        : error;
                }),
            );
            return;
        }
        const id = pending.sandbox.sandboxID;
        // Connect sets the time from now and, unlike timeout, never shortens
        // it, so a keep set from the CLI stays.
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
                                    error={!!templateError}
                                    aria-describedby="sandbox-template-help"
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
                                disabled={
                                    full || busyId === "new" || !!templateError
                                }
                            >
                                {busyId === "new"
                                    ? "Creating…"
                                    : "Create sandbox"}
                            </Button>
                        </form>
                        {templateError ? (
                            <p
                                id="sandbox-template-help"
                                className="text-sm text-intent-danger-text"
                            >
                                {templateError}
                            </p>
                        ) : (
                            <Text
                                id="sandbox-template-help"
                                size="sm"
                                tone="muted"
                            >
                                {Object.entries(pricing.templates)
                                    .map(
                                        ([id, size]) =>
                                            `${id} (${sizeLabel(size)})`,
                                    )
                                    .join(" and ")}{" "}
                                come with polli logged in. Or any public E2B
                                template, e.g. claude, codex, opencode or base;
                                team/name:tag works too.
                            </Text>
                        )}
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
                Sandbox time comes out of your Pollen ahead of time, past 24
                hours an hour at a time. Unused time isn’t refunded when you
                pause or kill a sandbox early. A sandbox pauses when its time
                ends; paused ones keep their files and cost nothing. To ssh in,
                install polli (<code>npm i -g @pollinations/cli</code>), run{" "}
                <code>polli auth login</code> and{" "}
                <code>polli sandbox ssh-config</code> once. ssh resumes a paused
                sandbox and adds 10 minutes at a time while connected.
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
                    !pending
                        ? ""
                        : pending.action === "create"
                          ? "Create"
                          : pending.action === "kill"
                            ? "Kill"
                            : addTo
                              ? "Add time"
                              : "Resume"
                }
                confirmDisabled={!!spends && !!durationError}
                onConfirm={confirm}
                onCancel={() => setPending(null)}
            >
                {pending?.action === "kill" && (
                    <ResourceConfirmationContent
                        resource={pending.sandbox.sandboxID}
                    >
                        This deletes the sandbox and its files and can’t be
                        undone. Unused time isn’t refunded.
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
                            {addTo ? "Add" : "Run it for"}
                        </ResourceConfirmationContent>
                        <div className="flex flex-col gap-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <Input
                                    type="number"
                                    min="0"
                                    step="any"
                                    inputMode="decimal"
                                    aria-label="How long"
                                    value={amount}
                                    error={!!durationError}
                                    className="w-20"
                                    onFocus={() => setUntilStopped(false)}
                                    onChange={(event) =>
                                        setAmount(event.currentTarget.value)
                                    }
                                />
                                <ButtonGroup>
                                    {UNITS.map((option) => (
                                        <TabButton
                                            key={option.seconds}
                                            size="sm"
                                            active={
                                                !untilStopped &&
                                                unit === option.seconds
                                            }
                                            onClick={() => {
                                                setUnit(option.seconds);
                                                setUntilStopped(false);
                                            }}
                                        >
                                            {option.label}
                                        </TabButton>
                                    ))}
                                    <TabButton
                                        size="sm"
                                        active={untilStopped}
                                        onClick={() => setUntilStopped(true)}
                                    >
                                        Until I stop it
                                    </TabButton>
                                </ButtonGroup>
                            </div>
                            {durationError && (
                                <p className="text-sm text-intent-danger-text">
                                    {durationError}
                                </p>
                            )}
                        </div>
                        {!durationError && (
                            <Alert intent="info">
                                {kept ? (
                                    <>
                                        Runs until{" "}
                                        {timeout === FOREVER
                                            ? "you pause or kill it"
                                            : new Date(
                                                  now + timeout * 1000,
                                              ).toLocaleString()}
                                        , an hour at a time. From your Pollen
                                        each hour:{" "}
                                        {upFront(pricing, pending, 3600)}.
                                    </>
                                ) : (
                                    <>
                                        From your Pollen now:{" "}
                                        {upFront(pricing, pending, paidNow)}.
                                    </>
                                )}{" "}
                                Unused time isn’t refunded.
                            </Alert>
                        )}
                    </>
                )}
            </ConfirmationDialog>
        </Section>
    );
}
