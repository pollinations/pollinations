import {
    Alert,
    Button,
    ButtonGroup,
    CheckIcon,
    ChevronIcon,
    Chip,
    ClockIcon,
    ConfirmationDialog,
    CopyField,
    DialogBody,
    DialogHeader,
    Dropdown,
    DropdownItem,
    Field,
    InlineLink,
    Input,
    LoadingStatus,
    PauseIcon,
    PlayIcon,
    PlusIcon,
    RefreshIcon,
    Section,
    Surface,
    TabButton,
    TerminalIcon,
    Text,
    TrashIcon,
    WalletIcon,
    XIcon,
} from "@pollinations/ui";
import { WalletKindIcon } from "@pollinations/ui/wallet";
import { useCallback, useEffect, useState } from "react";
import { genFetch } from "../api.ts";
import { genDocsUrl } from "../config.ts";
import { generateFunName } from "../lib/fun-name.ts";
import { ModelFormRow } from "./community-endpoints/model-form-row.tsx";
import { ResourceConfirmationContent } from "./community-endpoints/resource-confirmation-content.tsx";
import { readError } from "./community-endpoints/types.ts";
import { LoadError, SectionContent } from "./layout/dashboard-loading.tsx";
import { ResourceDialog } from "./layout/resource-dialog.tsx";

// Gen serves E2B's API here and keeps the sandbox rules and billing.
const E2B_PATH = "/alpha/e2b";

type Size = { cpuCount: number; memoryMB: number };

type Sandbox = Size & {
    sandboxID: string;
    templateID: string;
    alias?: string;
    // E2B's metadata; `name` is the name given at create.
    metadata?: Record<string, string>;
    state: "running" | "paused";
    // When its current run started: at the create or the last resume.
    startedAt: string;
    // When a running sandbox's timeout ends, or when a paused one paused.
    endAt: string;
};

type Pricing = {
    maxRunning: number;
    vcpuSecond: number;
    gibSecond: number;
    templates: Record<string, Size>;
};

// E2B's longest timeout, about 68 years: gen keeps the sandbox running until
// it's paused or killed.
const FOREVER = 2 ** 31 - 1;

// How long a create, a resume or more time runs the sandbox for: at least 10
// minutes, or until it's stopped. Gen keeps it running until then and takes
// the Pollen 10 minutes at a time.
const UNITS = [
    { label: "minutes", seconds: 60 },
    { label: "hours", seconds: 3600 },
    { label: "days", seconds: 86_400 },
];

// Installs polli, logs in and adds the `*.polli` ssh hosts.
const SSH_SETUP =
    "npm i -g @pollinations/cli && polli auth login && polli sandbox ssh-config";

// What E2B accepts: `name`, `name:tag` or `team/name:tag`.
const TEMPLATE_NAME = /^([a-z0-9_-]+\/)?[a-z0-9_-]+(:[a-z0-9._-]+)?$/;

type Pending =
    // notFound: E2B answered the create that it has no such template.
    | {
          action: "create";
          name: string;
          template: string;
          custom?: boolean;
          notFound?: boolean;
      }
    | { action: "connect"; sandbox: Sandbox }
    // Ends a running sandbox's "Until I stop it" after a while.
    | { action: "limit"; sandbox: Sandbox }
    | { action: "kill"; sandbox: Sandbox };

// Gen takes the Pollen 10 minutes at a time and refuses a step the wallet
// can't pay with 402.
const NO_POLLEN = "Not enough Pollen to pay for the next 10 minutes.";

async function e2b<T>(path: string, method = "GET", body?: unknown) {
    const response = await genFetch(`${E2B_PATH}${path}`, { method, body });
    // Gen's 402 message is for API callers, with a top-up URL to follow.
    if (response.status === 402) throw new Error(NO_POLLEN);
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
    `${cpuCount} vCPU, ${memoryMB / 1024} GB memory`;

// An always-on sandbox runs about 720 hours a month.
const HOURS_PER_MONTH = 720;

const templateLabel = (id: string) =>
    id === "pollinations"
        ? "Pollinations"
        : id === "pollinations-large"
          ? "Pollinations Large"
          : id;

// Past half of E2B's longest timeout, it runs until it's stopped.
const forever = (until: string) =>
    Date.parse(until) - Date.now() > FOREVER * 500;

function customError(seconds: number) {
    if (!(seconds > 0)) return "Enter how long, e.g. 2 hours.";
    if (seconds < 600) return "Minimum 10 minutes";
    if (seconds > FOREVER) return "That’s longer than Until I stop it.";
    return null;
}

function TemplatePicker({
    pricing,
    template,
    custom,
    error,
    onChange,
}: {
    pricing: Pricing;
    template: string;
    custom: boolean;
    error: string | null;
    onChange: (template: string, custom?: boolean) => void;
}) {
    const option = (id: string, size: Size) => (
        <span className="flex min-w-0 flex-1 flex-col gap-1 text-left">
            <span className="font-semibold">{templateLabel(id)}</span>
            <span className="text-xs font-normal text-theme-text-muted">
                {sizeLabel(size)} · {pollen(perSecond(pricing, size) * 3600)}
                /hour
            </span>
        </span>
    );
    return (
        <ModelFormRow
            label="Template"
            note={
                error && (
                    <p
                        id="sandbox-template-error"
                        className="text-xs text-intent-danger-text"
                    >
                        {error}
                    </p>
                )
            }
        >
            <div className="space-y-2">
                <Dropdown
                    portalled={false}
                    className="w-[var(--reference-width)] min-w-0 p-1"
                    trigger={(open) => (
                        <Button
                            type="button"
                            aria-label="Choose sandbox template"
                            className="w-full min-w-0 self-stretch justify-between gap-2"
                        >
                            <span className="min-w-0 truncate">
                                {custom
                                    ? "Other E2B template"
                                    : templateLabel(template)}
                            </span>
                            {!custom && pricing.templates[template] && (
                                <span className="ml-auto whitespace-nowrap text-xs font-normal">
                                    {pollen(
                                        perSecond(
                                            pricing,
                                            pricing.templates[template],
                                        ) * 3600,
                                    )}
                                    /hour
                                </span>
                            )}
                            <ChevronIcon
                                expanded={open}
                                className="h-4 w-4 shrink-0"
                            />
                        </Button>
                    )}
                >
                    {(close) => (
                        <>
                            {Object.entries(pricing.templates).map(
                                ([id, size]) => (
                                    <DropdownItem
                                        key={id}
                                        aria-pressed={
                                            !custom && template === id
                                        }
                                        onClick={() => {
                                            onChange(id);
                                            close();
                                        }}
                                    >
                                        {option(id, size)}
                                        <CheckIcon
                                            className={`h-4 w-4 shrink-0 ${!custom && template === id ? "" : "invisible"}`}
                                        />
                                    </DropdownItem>
                                ),
                            )}
                            <DropdownItem
                                aria-pressed={custom}
                                onClick={() => {
                                    onChange("", true);
                                    close();
                                }}
                            >
                                <span className="flex-1">
                                    Other E2B template
                                </span>
                                <CheckIcon
                                    className={`h-4 w-4 shrink-0 ${custom ? "" : "invisible"}`}
                                />
                            </DropdownItem>
                        </>
                    )}
                </Dropdown>
                {custom && (
                    <Field.Input asChild>
                        <Input
                            className="w-full"
                            aria-label="E2B template name"
                            placeholder="e.g. claude or team/name:tag"
                            value={template}
                            required
                            error={!!error}
                            aria-describedby={
                                error ? "sandbox-template-error" : undefined
                            }
                            onChange={(event) =>
                                onChange(event.currentTarget.value, true)
                            }
                        />
                    </Field.Input>
                )}
            </div>
        </ModelFormRow>
    );
}

function SandboxCard({
    sandbox,
    pricing,
    busy,
    onConnect,
    onLimit,
    onPause,
    onKill,
}: {
    sandbox: Sandbox;
    pricing: Pricing;
    busy: boolean;
    onConnect: () => void;
    onLimit: () => void;
    onPause: () => void;
    onKill: () => void;
}) {
    const running = sandbox.state === "running";
    const endless = running && forever(sandbox.endAt);
    return (
        <Surface className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                    <Text
                        tone="strong"
                        weight="semibold"
                        className={
                            sandbox.metadata?.name
                                ? "break-all"
                                : "break-all font-mono"
                        }
                    >
                        {sandbox.metadata?.name ?? sandbox.sandboxID}
                    </Text>
                    <Text size="sm" tone="muted">
                        {templateLabel(sandbox.alias ?? sandbox.templateID)} ·{" "}
                        {sizeLabel(sandbox)} ·{" "}
                        {pollen(perSecond(pricing, sandbox) * 3600)} an hour
                        while running
                    </Text>
                </div>
                <Chip intent={running ? "success" : "neutral"} size="md">
                    {!running
                        ? "Paused"
                        : endless
                          ? "Runs until you stop it"
                          : `Runs until ${new Date(sandbox.endAt).toLocaleString()}`}
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
                    icon={
                        !running ? (
                            <PlayIcon />
                        ) : endless ? (
                            <ClockIcon />
                        ) : (
                            <PlusIcon />
                        )
                    }
                    disabled={busy}
                    onClick={endless ? onLimit : onConnect}
                >
                    {!running
                        ? "Resume"
                        : endless
                          ? "Set time limit"
                          : "Add time"}
                </Button>
                {running && (
                    <Button
                        size="sm"
                        intent="commit"
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

    const template = pending?.action === "create" ? pending.template : "";
    const templateError =
        template.trim() && !TEMPLATE_NAME.test(template.trim())
            ? "Not a template name. Use lowercase letters, digits, - and _, e.g. claude or team/name:tag."
            : pending?.action === "create" && pending.notFound
              ? `There’s no public template “${template.trim()}”. Check the name, or pick Pollinations.`
              : null;
    const creating = busyId === "new";

    const seconds = untilStopped ? FOREVER : Math.round(Number(amount) * unit);
    const durationError = untilStopped ? null : customError(seconds);
    // Create, resume and a time limit run from now; Add time adds to the time
    // a running sandbox already runs for.
    const addTo =
        pending?.action === "connect" && pending.sandbox.state === "running"
            ? pending.sandbox
            : null;
    const now = Date.now();
    const from = addTo ? Date.parse(addTo.endAt) : now;
    const timeout = Math.min(FOREVER, Math.ceil((from - now) / 1000) + seconds);
    const loading = !pricing && !loadError;
    const running = sandboxes.filter((s) => s.state === "running").length;
    const full = !!pricing && running >= pricing.maxRunning;
    const spends = pending && pending.action !== "kill";
    const canConfirm =
        !!pending &&
        (pending.action === "kill" ||
            (!durationError &&
                (pending.action !== "create" ||
                    (!!template.trim() &&
                        !templateError &&
                        !full &&
                        !creating))));

    function confirm() {
        if (!pending || !canConfirm) return;
        if (pending.action === "create") {
            // The same request as `polli sandbox create`. The dialog stays
            // open until it's done, so a template E2B doesn't have can be
            // fixed in place.
            void run("new", () =>
                e2b("/sandboxes", "POST", {
                    templateID: pending.template.trim(),
                    timeout,
                    autoPause: true,
                    ...(pending.name.trim() && {
                        metadata: { name: pending.name.trim() },
                    }),
                }).then(
                    () => setPending(null),
                    (error: Error) => {
                        if (!/not found/i.test(error.message)) {
                            setPending(null);
                            throw error;
                        }
                        setPending({ ...pending, notFound: true });
                    },
                ),
            );
            return;
        }
        setPending(null);
        const id = pending.sandbox.sandboxID;
        // Connect sets the time from now and, unlike timeout, never shortens
        // it, so a keep set from the CLI stays. A time limit is meant to
        // shorten it.
        void run(id, () =>
            pending.action === "kill"
                ? e2b(`/sandboxes/${id}`, "DELETE")
                : e2b(
                      `/sandboxes/${id}/${pending.action === "limit" ? "timeout" : "connect"}`,
                      "POST",
                      { timeout },
                  ),
        );
    }

    const createAction = (
        <Button
            type="button"
            className="dashboard-add-button"
            aria-label={
                busyId === "new" ? "Creating sandbox…" : "Create sandbox"
            }
            title={busyId === "new" ? "Creating sandbox…" : "Create sandbox"}
            aria-busy={busyId === "new"}
            aria-haspopup="dialog"
            disabled={full || busyId === "new"}
            onClick={() =>
                setPending({
                    action: "create",
                    name: generateFunName(),
                    template: "pollinations",
                })
            }
        >
            {busyId === "new" ? (
                <LoadingStatus>
                    <span className="sr-only">Creating sandbox…</span>
                </LoadingStatus>
            ) : (
                <>
                    <PlusIcon className="h-4 w-4" />
                    <TerminalIcon className="h-5 w-5" />
                </>
            )}
        </Button>
    );

    return (
        <Section
            title="Sandboxes"
            intro="A sandbox is a Linux computer in the cloud. Open it with ssh or VS Code. Its files stay while it’s paused, and you pay only while it runs."
            action={
                <ButtonGroup>
                    <Button
                        size="sm"
                        intent="neutral"
                        icon={<RefreshIcon />}
                        disabled={loading}
                        onClick={() => void load()}
                    >
                        Refresh
                    </Button>
                    {sandboxes.length > 0 && createAction}
                </ButtonGroup>
            }
        >
            {loadError && <LoadError onRetry={load}>{loadError}</LoadError>}
            {actionError && (
                <Alert intent="danger">
                    {actionError}
                    {actionError === NO_POLLEN && (
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
                        {sandboxes.length > 0 && (
                            <Text size="sm" tone={full ? "strong" : "muted"}>
                                {running} of {pricing.maxRunning} running.
                                {full &&
                                    " Pause or kill one to start or resume another."}
                            </Text>
                        )}
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
                                    onLimit={() => {
                                        setUntilStopped(false);
                                        setPending({
                                            action: "limit",
                                            sandbox,
                                        });
                                    }}
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
                                <Surface className="p-6 text-center">
                                    <div className="mb-2">{createAction}</div>
                                    <p className="text-sm text-theme-text-muted">
                                        Run code and agents in your own sandbox.
                                    </p>
                                </Surface>
                            )}
                        </div>
                    </div>
                )}
            </SectionContent>
            <p className="flex items-start gap-1.5 px-1 text-[13px] leading-snug text-theme-text-muted">
                <WalletIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                    Pay with{" "}
                    <span className="inline-flex items-center gap-1 align-middle whitespace-nowrap">
                        <WalletKindIcon kind="tier" /> Quest Pollen
                    </span>{" "}
                    or{" "}
                    <span className="inline-flex items-center gap-1 align-middle whitespace-nowrap">
                        <WalletKindIcon kind="paid" /> Paid Pollen
                    </span>{" "}
                    in 10-minute steps.
                    {pricing && (
                        <>
                            {" "}
                            {Object.entries(pricing.templates).map(
                                ([template, size]) => {
                                    const hourly =
                                        perSecond(pricing, size) * 3600;
                                    return (
                                        <span key={template}>
                                            {templateLabel(template)} (
                                            {sizeLabel(size)}): {pollen(hourly)}{" "}
                                            an hour, about{" "}
                                            {pollen(hourly * HOURS_PER_MONTH)} a
                                            month if always on.{" "}
                                        </span>
                                    );
                                },
                            )}
                            Up to {pricing.maxRunning} running at once; pause or
                            kill one to free a slot.
                        </>
                    )}{" "}
                    Sandboxes pause when time runs out. A paused sandbox costs
                    nothing and keeps its files. Unused time isn’t refunded.
                </span>
            </p>
            <div className="flex items-start gap-1.5 px-1 text-[13px] leading-snug text-theme-text-muted">
                <TerminalIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <p>
                        Connect to your sandbox with SSH: run this once, then
                        use the ssh command on its card. A paused sandbox
                        resumes, and it keeps running while you’re connected,
                        paid 10 minutes at a time.
                    </p>
                    <CopyField
                        label="Copy the polli setup command"
                        value={SSH_SETUP}
                    />
                </div>
            </div>

            <ConfirmationDialog
                open={pending?.action === "kill"}
                title="Kill sandbox?"
                confirmLabel="Kill"
                onConfirm={confirm}
                onCancel={() => setPending(null)}
            >
                <ResourceConfirmationContent
                    resource={
                        pending?.action === "kill"
                            ? pending.sandbox.sandboxID
                            : ""
                    }
                >
                    This deletes the sandbox and its files and can’t be undone.
                    Unused time isn’t refunded.
                </ResourceConfirmationContent>
            </ConfirmationDialog>
            <ResourceDialog
                open={!!spends}
                onOpenChange={(open) => !open && !creating && setPending(null)}
                size="lg"
            >
                <form
                    className="flex min-h-0 flex-1 flex-col"
                    noValidate
                    onSubmit={(event) => {
                        event.preventDefault();
                        confirm();
                    }}
                >
                    <DialogBody
                        actions={
                            <>
                                <Button
                                    type="button"
                                    intent="neutral"
                                    icon={<XIcon />}
                                    disabled={creating}
                                    onClick={() => setPending(null)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    intent="commit"
                                    icon={
                                        pending?.action === "create" ? (
                                            <TerminalIcon />
                                        ) : (
                                            <PlayIcon />
                                        )
                                    }
                                    aria-busy={creating}
                                    disabled={!canConfirm}
                                >
                                    {!pending
                                        ? ""
                                        : pending.action === "create"
                                          ? "Create sandbox"
                                          : pending.action === "limit"
                                            ? "Set time limit"
                                            : addTo
                                              ? "Add time"
                                              : "Resume"}
                                </Button>
                            </>
                        }
                    >
                        <DialogHeader
                            inBody
                            title={
                                !pending
                                    ? ""
                                    : pending.action === "create"
                                      ? "Create sandbox"
                                      : pending.action === "limit"
                                        ? "Set a time limit"
                                        : addTo
                                          ? "Add time"
                                          : "Resume sandbox"
                            }
                            description={
                                pending?.action === "create" && (
                                    <>
                                        Choose a template and how long to run
                                        it.{" "}
                                        <InlineLink
                                            href={genDocsUrl("#tag/sandboxes")}
                                        >
                                            Read the guide
                                        </InlineLink>
                                    </>
                                )
                            }
                        />
                        {spends && pending.action !== "create" && (
                            <Surface>
                                <dl className="grid gap-2 text-sm sm:grid-cols-[11rem_minmax(0,1fr)]">
                                    {pending.sandbox.metadata?.name && (
                                        <>
                                            <dt className="font-semibold text-theme-text-strong">
                                                Name
                                            </dt>
                                            <dd className="break-all">
                                                {pending.sandbox.metadata.name}
                                            </dd>
                                        </>
                                    )}
                                    <dt className="font-semibold text-theme-text-strong">
                                        ID
                                    </dt>
                                    <dd className="break-all font-mono">
                                        {pending.sandbox.sandboxID}
                                    </dd>
                                    <dt className="font-semibold text-theme-text-strong">
                                        Status
                                    </dt>
                                    <dd>
                                        <Chip
                                            size="sm"
                                            intent={
                                                pending.sandbox.state ===
                                                "running"
                                                    ? "success"
                                                    : "neutral"
                                            }
                                        >
                                            {pending.sandbox.state === "running"
                                                ? "Running"
                                                : "Paused"}
                                        </Chip>
                                    </dd>
                                    <dt className="font-semibold text-theme-text-strong">
                                        Template
                                    </dt>
                                    <dd>
                                        {templateLabel(
                                            pending.sandbox.alias ??
                                                pending.sandbox.templateID,
                                        )}
                                        <span className="text-theme-text-muted">
                                            {" "}
                                            · {sizeLabel(pending.sandbox)}
                                        </span>
                                    </dd>
                                    {pricing && (
                                        <>
                                            <dt className="font-semibold text-theme-text-strong">
                                                Hourly cost
                                            </dt>
                                            <dd>
                                                {pollen(
                                                    perSecond(
                                                        pricing,
                                                        pending.sandbox,
                                                    ) * 3600,
                                                )}
                                            </dd>
                                        </>
                                    )}
                                </dl>
                            </Surface>
                        )}
                        {spends && pricing && (
                            <>
                                <Surface className="space-y-4">
                                    {pending.action === "create" && (
                                        <>
                                            <ModelFormRow
                                                label="Name"
                                                help="Shown in your sandbox list. It can’t be changed later."
                                            >
                                                <Field.Input asChild>
                                                    <Input
                                                        className="w-full"
                                                        value={pending.name}
                                                        onChange={(event) =>
                                                            setPending({
                                                                ...pending,
                                                                name: event
                                                                    .currentTarget
                                                                    .value,
                                                            })
                                                        }
                                                    />
                                                </Field.Input>
                                            </ModelFormRow>
                                            <TemplatePicker
                                                pricing={pricing}
                                                template={template}
                                                custom={!!pending.custom}
                                                error={templateError}
                                                onChange={(template, custom) =>
                                                    setPending({
                                                        action: "create",
                                                        name: pending.name,
                                                        template,
                                                        custom,
                                                    })
                                                }
                                            />
                                        </>
                                    )}
                                    <ModelFormRow
                                        label={
                                            addTo ? "Add time" : "Run it for"
                                        }
                                        help={
                                            pending.action === "limit"
                                                ? "At least 10 minutes. The sandbox pauses when time runs out."
                                                : "At least 10 minutes. Choose Until I stop it to keep running until you pause or kill it."
                                        }
                                        note={
                                            <Chip
                                                id="sandbox-duration-status"
                                                size="sm"
                                                intent={
                                                    durationError
                                                        ? "danger"
                                                        : "info"
                                                }
                                                className="polli:h-auto polli:max-w-full polli:py-1 polli:leading-snug"
                                            >
                                                <ClockIcon className="h-3 w-3 shrink-0" />
                                                {durationError ||
                                                    (timeout === FOREVER
                                                        ? "Will run until you pause or kill it"
                                                        : `Will run until ${new Date(now + timeout * 1000).toLocaleString()}`)}
                                            </Chip>
                                        }
                                    >
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Field.Input asChild>
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    step="any"
                                                    inputMode="decimal"
                                                    aria-label="How long"
                                                    aria-describedby="sandbox-duration-status"
                                                    value={amount}
                                                    error={!!durationError}
                                                    className="w-20"
                                                    onFocus={() =>
                                                        setUntilStopped(false)
                                                    }
                                                    onChange={(event) =>
                                                        setAmount(
                                                            event.currentTarget
                                                                .value,
                                                        )
                                                    }
                                                />
                                            </Field.Input>
                                            <ButtonGroup aria-label="Duration unit">
                                                {UNITS.map((option) => (
                                                    <TabButton
                                                        key={option.seconds}
                                                        size="sm"
                                                        active={
                                                            !untilStopped &&
                                                            unit ===
                                                                option.seconds
                                                        }
                                                        onClick={() => {
                                                            setUnit(
                                                                option.seconds,
                                                            );
                                                            setUntilStopped(
                                                                false,
                                                            );
                                                        }}
                                                    >
                                                        {option.label}
                                                    </TabButton>
                                                ))}
                                                {pending.action !== "limit" && (
                                                    <TabButton
                                                        size="sm"
                                                        active={untilStopped}
                                                        onClick={() =>
                                                            setUntilStopped(
                                                                true,
                                                            )
                                                        }
                                                    >
                                                        Until I stop it
                                                    </TabButton>
                                                )}
                                            </ButtonGroup>
                                        </div>
                                    </ModelFormRow>
                                </Surface>
                                {pending.action === "create" && (
                                    <p className="flex items-start gap-1.5 px-1 text-[13px] leading-snug text-theme-text-muted">
                                        <TerminalIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                        {/* E2B tells only the team that built a
                                            template its size, so another team's
                                            template is priced once it runs. */}
                                        <span>
                                            Pollinations templates include the{" "}
                                            <InlineLink href="https://github.com/pollinations/pollinations/tree/main/packages/polli-cli">
                                                polli CLI
                                            </InlineLink>
                                            , already signed in. Any other{" "}
                                            <InlineLink href="https://docs.e2b.dev/use-cases/coding-agents">
                                                public E2B template
                                            </InlineLink>{" "}
                                            works too; its hourly cost shows on
                                            its card once it starts.
                                        </span>
                                    </p>
                                )}
                            </>
                        )}
                    </DialogBody>
                </form>
            </ResourceDialog>
        </Section>
    );
}
