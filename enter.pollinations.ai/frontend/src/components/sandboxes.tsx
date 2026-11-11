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
    PauseIcon,
    PlayIcon,
    PlusIcon,
    Section,
    Surface,
    TabButton,
    TerminalIcon,
    Text,
    TrashIcon,
    WalletIcon,
    XIcon,
} from "@pollinations/ui";
import { TierChip, WalletKindIcon } from "@pollinations/ui/wallet";
import {
    SANDBOX_PROVIDERS,
    sandboxTemplate,
} from "@shared/registry/sandbox.ts";
import { useCallback, useEffect, useState } from "react";
import { genFetch } from "../api.ts";
import { genDocsUrl } from "../config.ts";
import { generateFunName } from "../lib/fun-name.ts";
import { ModelFormRow } from "./community-endpoints/model-form-row.tsx";
import { ResourceConfirmationContent } from "./community-endpoints/resource-confirmation-content.tsx";
import { readError } from "./community-endpoints/types.ts";
import { LoadError, SectionContent } from "./layout/dashboard-loading.tsx";
import { ResourceDialog } from "./layout/resource-dialog.tsx";
import { Footnotes } from "./pollen/pollen-balance.tsx";
import {
    amount,
    LAUNCH_DISCOUNT,
    SandboxTemplateList,
} from "./sandbox-templates.tsx";

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

type Rates = { vcpuSecond: number; gibSecond: number };

// Each template has its provider's rates; the top level's are other E2B
// templates'.
type Pricing = Rates & {
    maxRunning: number;
    templates: Record<string, Size & Rates>;
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

// E2B names a sandbox's template by id, and by name in `alias`.
const templateOf = (sandbox: Sandbox) => sandbox.alias ?? sandbox.templateID;

const perSecond = (pricing: Pricing, template: string, size: Size) => {
    const { vcpuSecond, gibSecond } = pricing.templates[template] ?? pricing;
    return size.cpuCount * vcpuSecond + (size.memoryMB / 1024) * gibSecond;
};

const pollen = (amount: number) => `${Number(amount.toPrecision(2))} pollen`;

// What a template gives you, as its title: "2 vCPU · 2 GB memory · 26 GB
// disk". The size comes from the registry, or from the sandbox or pricing for
// a template the registry doesn't list (no disk then).
const templateTitle = (id: string, size?: Size) => {
    const template = sandboxTemplate(id);
    const { cpuCount, memoryMB } = size ?? template ?? {};
    return [
        cpuCount && `${cpuCount} vCPU`,
        memoryMB && `${memoryMB / 1024} GB memory`,
        template && `${Math.round(template.diskSizeMB / 1024)} GB disk`,
    ]
        .filter(Boolean)
        .join(" · ");
};

// Where it runs, shown quieter beside the title; another E2B template shows
// its own name.
const templateSource = (id: string) => {
    const template = sandboxTemplate(id);
    return template ? SANDBOX_PROVIDERS[template.provider].name : id;
};

// The picker's title: the size, then where it runs in quieter brackets.
const TemplateName = ({ id, size }: { id: string; size?: Size }) => (
    <>
        {templateTitle(id, size)}{" "}
        <span className="font-normal opacity-60">({templateSource(id)})</span>
    </>
);

// When a running sandbox stops, as a value and a small unit like the price
// row: "3:30 PM" "in 30 min", or past two days "Nov 14" "in 3 d".
const stopsAt = (endAt: string) => {
    const end = new Date(endAt);
    const minutes = Math.max(
        0,
        Math.round((end.getTime() - Date.now()) / 60000),
    );
    if (minutes >= 48 * 60) {
        return {
            at: end.toLocaleDateString([], { month: "short", day: "numeric" }),
            left: `in ${Math.round(minutes / 1440)} d`,
        };
    }
    return {
        at: end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        left:
            minutes < 60
                ? `in ${minutes} min`
                : `in ${Math.round(minutes / 60)} h`,
    };
};

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
    // Open, each option has room: the size and where it runs, then its price
    // and that Quest pollen pays for it (as every sandbox can).
    const option = (id: string, size: Size) => (
        <span className="flex min-w-0 flex-1 flex-col gap-1 text-left">
            <span className="font-semibold">
                <TemplateName id={id} size={size} />
            </span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-normal text-theme-text-muted">
                <span>{pollen(perSecond(pricing, id, size) * 3600)}/hour</span>
                <TierChip size="sm">
                    <WalletKindIcon kind="tier" />
                    Quest
                </TierChip>
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
                                {custom ? (
                                    "Other E2B template"
                                ) : (
                                    <TemplateName
                                        id={template}
                                        size={pricing.templates[template]}
                                    />
                                )}
                            </span>
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
    const template = templateOf(sandbox);
    const stops = running && !endless ? stopsAt(sandbox.endAt) : null;
    // What runs, first: its name with a Running or Paused chip and, when it
    // runs, until when. Then what it is, the ssh command and the actions.
    return (
        <Surface className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span
                        className={`break-all font-semibold text-theme-text-strong ${sandbox.metadata?.name ? "" : "font-mono"}`}
                    >
                        {sandbox.metadata?.name ?? sandbox.sandboxID}
                    </span>
                    <Chip intent={running ? "success" : "neutral"} size="sm">
                        {running ? "Running" : "Paused"}
                    </Chip>
                    {running && (
                        <span className="text-sm text-theme-text-muted">
                            {stops
                                ? `until ${stops.at} · ${stops.left}`
                                : "until you stop it"}
                        </span>
                    )}
                </div>
                <span className="text-sm text-theme-text-muted">
                    {templateTitle(template, sandbox)} (
                    {templateSource(template)}) · $
                    {amount(perSecond(pricing, template, sandbox) * 3600)}/hour
                </span>
            </div>
            {/* Only as wide as the command needs. */}
            <div className="w-fit min-w-0 max-w-full">
                <CopyField
                    label={`Copy ssh command for ${sandbox.sandboxID}`}
                    value={`ssh ${sandbox.sandboxID}.polli`}
                />
            </div>
            <ButtonGroup>
                <Button
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
                        intent="commit"
                        icon={<PauseIcon />}
                        disabled={busy}
                        onClick={onPause}
                    >
                        Pause
                    </Button>
                )}
                <Button
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

// Your sandboxes, then the templates you start new ones from. Signed out
// the templates are just a price list; the sign-in banner is the way in.
export function Sandboxes({ signedIn }: { signedIn: boolean }) {
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
        // The pricing is public and loads on its own, so the templates show
        // even when your sandboxes can't load; those need you signed in.
        const [prices, list] = await Promise.allSettled([
            e2b<Pricing>("/pricing"),
            signedIn ? e2b<Sandbox[]>("/v2/sandboxes") : [],
        ]);
        if (prices.status === "fulfilled") setPricing(prices.value);
        if (list.status === "fulfilled") setSandboxes(list.value);
        const failed = [prices, list].find(
            (result) => result.status === "rejected",
        );
        if (failed) {
            setLoadError(
                failed.reason instanceof Error
                    ? failed.reason.message
                    : "Couldn’t load sandboxes.",
            );
        }
    }, [signedIn]);

    // No refresh button: the list reloads after every action and whenever
    // you come back to the tab, so a sandbox that paused meanwhile shows it.
    useEffect(() => {
        void load();
        const onVisible = () => {
            if (document.visibilityState === "visible") void load();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () =>
            document.removeEventListener("visibilitychange", onVisible);
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

    const hasSandboxes = !!pricing && sandboxes.length > 0;
    const alerts = (
        <>
            {loadError && (
                <LoadError
                    onRetry={load}
                    paths={["/alpha/e2b/pricing", "/alpha/e2b/v2/sandboxes"]}
                >
                    {loadError}
                </LoadError>
            )}
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
        </>
    );

    // Two cards: yours (only when you have some, running or paused), then
    // the templates you start new ones from. With none, just the second.
    return (
        <>
            {hasSandboxes && (
                <Section title="Your sandboxes">
                    {alerts}
                    {/* The limit shows only once it's reached; the footnote
                        below the templates names it otherwise. */}
                    {full && (
                        <Text size="sm" tone="strong">
                            {running} of {pricing.maxRunning} running. Pause or
                            kill one to start or resume another.
                        </Text>
                    )}
                    <div className="flex flex-col gap-3" aria-live="polite">
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
                                    setPending({
                                        action: "kill",
                                        sandbox,
                                    })
                                }
                            />
                        ))}
                    </div>
                    <Footnotes>
                        <div className="flex items-start gap-1.5">
                            <TerminalIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <div className="flex min-w-0 flex-1 flex-col gap-2">
                                <p>
                                    Connect with SSH or VS Code: run this once,
                                    then use the ssh command on its card.
                                </p>
                                <CopyField
                                    label="Copy the polli setup command"
                                    value={SSH_SETUP}
                                />
                            </div>
                        </div>
                    </Footnotes>
                </Section>
            )}
            <Section title="New sandbox">
                {!hasSandboxes && alerts}
                <SectionContent loading={loading}>
                    {/* Gen's pricing lists the templates that can start, so
                        the cards and the create picker always agree. */}
                    {pricing && (
                        <SandboxTemplateList
                            prices={Object.fromEntries(
                                Object.entries(pricing.templates).map(
                                    ([id, size]) => [
                                        id,
                                        perSecond(pricing, id, size) * 3600,
                                    ],
                                ),
                            )}
                            create={
                                signedIn
                                    ? {
                                          label: creating
                                              ? "Creating…"
                                              : "Create",
                                          disabled: full || creating,
                                          onCreate: (template) =>
                                              setPending({
                                                  action: "create",
                                                  name: generateFunName(),
                                                  template,
                                              }),
                                      }
                                    : undefined
                            }
                        />
                    )}
                </SectionContent>
                <Footnotes>
                    <p className="flex items-start gap-1.5">
                        <WalletIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                            Paid 10 minutes at a time.
                            {LAUNCH_DISCOUNT > 0 &&
                                ` Launch price: ${LAUNCH_DISCOUNT}% off.`}
                        </span>
                    </p>
                    <p className="flex items-start gap-1.5">
                        <ClockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                            Sandboxes pause when their time runs out. A paused
                            one costs nothing, keeps its files and resumes when
                            you connect.
                            {pricing && (
                                <> Up to {pricing.maxRunning} run at once.</>
                            )}
                        </span>
                    </p>
                    <p className="flex items-start gap-1.5">
                        <TerminalIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                            A Linux computer in the cloud. See the{" "}
                            <InlineLink href={genDocsUrl("#tag/sandboxes")}>
                                Sandboxes docs
                            </InlineLink>
                            .
                        </span>
                    </p>
                </Footnotes>
            </Section>

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
                                          ? "Create"
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
                                        {templateTitle(
                                            templateOf(pending.sandbox),
                                            pending.sandbox,
                                        )}
                                        <span className="text-theme-text-muted">
                                            {" "}
                                            ·{" "}
                                            {templateSource(
                                                templateOf(pending.sandbox),
                                            )}
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
                                                        templateOf(
                                                            pending.sandbox,
                                                        ),
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
        </>
    );
}
