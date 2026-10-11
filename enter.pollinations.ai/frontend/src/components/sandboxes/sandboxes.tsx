import {
    Alert,
    Button,
    ConfirmationDialog,
    Field,
    Input,
    PlusIcon,
    Section,
    Surface,
} from "@pollinations/ui";
import { formatPollen } from "@pollinations/ui/wallet";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { genFetch } from "../../api.ts";
import { LoadError, PageStatus } from "../layout/dashboard-loading.tsx";
import { SandboxCard } from "./sandbox-card.tsx";
import {
    DURATIONS,
    seconds as formatSeconds,
    type Pricing,
    price,
    type Sandbox,
} from "./types.ts";

const E2B = "/alpha/e2b";

type Action =
    | { kind: "create" }
    | { kind: "resume" | "extend" | "pause" | "kill"; sandbox: Sandbox };

// Gen answers with `{ code, message }`; a 402 also needs a way to add Pollen.
async function failure(response: Response): Promise<string> {
    const body = (await response.json().catch(() => null)) as {
        message?: string;
    } | null;
    return body?.message ?? `Request failed (${response.status})`;
}

export function Sandboxes() {
    const [pricing, setPricing] = useState<Pricing | null>(null);
    const [sandboxes, setSandboxes] = useState<Sandbox[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [action, setAction] = useState<Action | null>(null);
    const [template, setTemplate] = useState("pollinations");
    const [duration, setDuration] = useState(3600);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<{
        message: string;
        status?: number;
    } | null>(null);
    // Re-render as paid time runs out.
    const [now, setNow] = useState(Date.now());

    const load = useCallback(async () => {
        try {
            const [priceResponse, listResponse] = await Promise.all([
                genFetch(`${E2B}/pricing`),
                genFetch(`${E2B}/v2/sandboxes`),
            ]);
            if (!priceResponse.ok)
                throw new Error(await failure(priceResponse));
            if (!listResponse.ok) throw new Error(await failure(listResponse));
            setPricing(await priceResponse.json());
            setSandboxes(await listResponse.json());
            setLoadError(null);
        } catch (thrown) {
            setLoadError(
                thrown instanceof Error
                    ? thrown.message
                    : "Couldn’t load your sandboxes.",
            );
        }
        setNow(Date.now());
    }, []);

    useEffect(() => {
        void load();
        const refresh = setInterval(() => void load(), 15_000);
        return () => clearInterval(refresh);
    }, [load]);

    if (!pricing || !sandboxes) {
        return (
            <Section title="Sandboxes">
                {loadError ? (
                    <LoadError onRetry={load}>{loadError}</LoadError>
                ) : (
                    <PageStatus />
                )}
            </Section>
        );
    }

    const running = sandboxes.filter((s) => s.state === "running").length;
    const full = running >= pricing.maxRunning;
    const size = (id: string) =>
        pricing.templates.find((t) => t.id === id) ?? pricing.templates[0];

    // What the open dialog spends, and the seconds it buys.
    const target = action && "sandbox" in action ? action.sandbox : null;
    const leftSeconds = target
        ? Math.max(0, (Date.parse(target.endAt) - now) / 1000)
        : 0;
    // E2B ends a run after 24 hours, so a running sandbox can only be extended
    // up to there.
    const room = target
        ? (Date.parse(target.startedAt) - now) / 1000 +
          pricing.maxRunSeconds -
          leftSeconds
        : pricing.maxRunSeconds;
    const options = DURATIONS.filter(
        (seconds) => action?.kind !== "extend" || seconds <= room,
    );
    const seconds = options.includes(duration) ? duration : options[0];
    const cost =
        action?.kind === "create"
            ? price(pricing, size(template), seconds)
            : target
              ? price(pricing, target, seconds)
              : 0;

    function open(next: Action) {
        setError(null);
        setAction(next);
    }

    async function confirm() {
        if (!action) return;
        setPending(true);
        setError(null);
        try {
            const id = target?.sandboxID;
            const response =
                action.kind === "create"
                    ? await genFetch(`${E2B}/sandboxes`, {
                          method: "POST",
                          body: {
                              templateID: template.trim(),
                              timeout: seconds,
                              autoPause: true,
                          },
                      })
                    : action.kind === "kill"
                      ? await genFetch(`${E2B}/sandboxes/${id}`, {
                            method: "DELETE",
                        })
                      : action.kind === "pause"
                        ? await genFetch(`${E2B}/sandboxes/${id}/pause`, {
                              method: "POST",
                          })
                        : await genFetch(
                              `${E2B}/sandboxes/${id}/${action.kind === "resume" ? "connect" : "timeout"}`,
                              {
                                  method: "POST",
                                  body: {
                                      timeout:
                                          action.kind === "resume"
                                              ? seconds
                                              : Math.ceil(leftSeconds) +
                                                seconds,
                                  },
                              },
                          );
            if (response.ok) {
                setAction(null);
                await load();
            } else {
                setError({
                    message: await failure(response),
                    status: response.status,
                });
            }
        } catch {
            setError({ message: "Request failed. Try again." });
        } finally {
            setPending(false);
        }
    }

    const spends =
        action !== null && action.kind !== "pause" && action.kind !== "kill";
    const copy: Record<
        Action["kind"],
        { title: string; confirm: string; text: string }
    > = {
        create: {
            title: "Create a sandbox?",
            confirm: "Create",
            text: `Starts a ${template.trim() || "new"} sandbox that stays up for ${formatSeconds(seconds)}. You can run ${pricing.maxRunning} at once; ${running} running now.`,
        },
        resume: {
            title: "Resume this sandbox?",
            confirm: "Resume",
            text: `Brings ${target?.sandboxID} back with its files and memory for ${formatSeconds(seconds)}.`,
        },
        extend: {
            title: "Add time?",
            confirm: "Add time",
            text: `Keeps ${target?.sandboxID} running ${formatSeconds(seconds)} longer.`,
        },
        pause: {
            title: "Pause this sandbox?",
            confirm: "Pause",
            text: `${target?.sandboxID} keeps its files and memory and stops running. The rest of its paid time is lost, and resuming pays again. Time is paid in advance and is not refunded.`,
        },
        kill: {
            title: "Kill this sandbox?",
            confirm: "Kill",
            text: `Deletes ${target?.sandboxID} and its files for good. The rest of its paid time is lost: sandbox time is paid in advance and is not refunded.`,
        },
    };
    const dialog = action && copy[action.kind];

    return (
        <Section
            title="Sandboxes"
            intro={`Linux sandboxes paid from your Pollen. You can run ${pricing.maxRunning} at once; ${running} running now.`}
            action={
                <Button
                    type="button"
                    intent="commit"
                    icon={<PlusIcon />}
                    disabled={full}
                    onClick={() => open({ kind: "create" })}
                >
                    New sandbox
                </Button>
            }
        >
            <div className="flex flex-col gap-3">
                {loadError && <Alert intent="danger">{loadError}</Alert>}
                {full && (
                    <Alert intent="advisory">
                        {running} of {pricing.maxRunning} sandboxes are running.
                        Pause or kill one to start or resume another.
                    </Alert>
                )}
                {sandboxes.length === 0 ? (
                    <Surface className="p-6 text-center text-sm text-theme-text-muted">
                        No sandboxes yet. Create one, then connect with{" "}
                        <code>ssh &lt;id&gt;.polli</code>.
                    </Surface>
                ) : (
                    sandboxes.map((sandbox) => (
                        <SandboxCard
                            key={sandbox.sandboxID}
                            sandbox={sandbox}
                            pricing={pricing}
                            now={now}
                            full={full}
                            onAction={(kind) => open({ kind, sandbox })}
                        />
                    ))
                )}
                <p className="px-1 text-[13px] leading-snug text-theme-text-muted">
                    To connect, install the CLI and run{" "}
                    <code>polli sandbox ssh-config</code> once. Then{" "}
                    <code>ssh &lt;id&gt;.polli</code> reaches a sandbox from
                    this page, and <code>polli sandbox list</code> shows it.
                    Time is paid in advance and is not refunded.
                </p>
            </div>
            <ConfirmationDialog
                open={action !== null}
                title={dialog?.title ?? ""}
                description={dialog?.text}
                intent={
                    action?.kind === "kill"
                        ? "danger"
                        : action?.kind === "pause"
                          ? "neutral"
                          : "commit"
                }
                confirmLabel={pending ? "Working…" : (dialog?.confirm ?? "")}
                confirmDisabled={pending}
                cancelDisabled={pending}
                onConfirm={() => void confirm()}
                onCancel={() => setAction(null)}
            >
                <div className="flex flex-col gap-3">
                    {action?.kind === "create" && (
                        <Field.Root className="flex flex-col gap-1">
                            <Field.Label className="text-sm font-semibold">
                                Template
                            </Field.Label>
                            <Field.Input asChild>
                                <Input
                                    list="sandbox-templates"
                                    value={template}
                                    onChange={(event) =>
                                        setTemplate(event.target.value)
                                    }
                                />
                            </Field.Input>
                            <datalist id="sandbox-templates">
                                {pricing.templates.map((t) => (
                                    <option key={t.id} value={t.id} />
                                ))}
                            </datalist>
                        </Field.Root>
                    )}
                    {spends && (
                        <div className="flex flex-col gap-1">
                            <span className="text-sm font-semibold">
                                {action?.kind === "extend" ? "Add" : "Pay for"}
                            </span>
                            <div className="flex flex-wrap gap-2">
                                {options.map((option) => (
                                    <Button
                                        key={option}
                                        type="button"
                                        size="sm"
                                        intent={
                                            option === seconds
                                                ? "commit"
                                                : "neutral"
                                        }
                                        onClick={() => setDuration(option)}
                                    >
                                        {formatSeconds(option)}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    )}
                    {spends && (
                        <Alert intent="advisory">
                            Charges {formatPollen(cost)} Pollen now
                            {action?.kind === "create" &&
                            !pricing.templates.some((t) => t.id === template)
                                ? " (estimated for a 2 vCPU, 2 GB template; the template’s size sets the price)"
                                : ""}
                            . Sandbox time is paid in advance and is not
                            refunded.
                        </Alert>
                    )}
                    {error && (
                        <Alert intent="danger">
                            {error.message}{" "}
                            {error.status === 402 && (
                                <Link to="/pollen" className="underline">
                                    Add Pollen
                                </Link>
                            )}
                        </Alert>
                    )}
                </div>
            </ConfirmationDialog>
        </Section>
    );
}
