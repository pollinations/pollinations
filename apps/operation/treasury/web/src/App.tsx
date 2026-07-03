import {
    Alert,
    Button,
    Chip,
    ColorModeToggle,
    Heading,
    Input,
    ScrollArea,
    TabButton,
    Text,
} from "@pollinations/ui";
import { useEffect, useMemo, useState } from "react";
import { CommitTray } from "./components/CommitTray";
import { SourceLegend } from "./components/SourceLegend";
import { STALE_AFTER_HOURS } from "./config";
import { hoursSince } from "./lib/format";
import {
    queuedKeysForChange,
    queuedMeterKey,
    queuedReconKey,
} from "./lib/queued";
import { StagingProvider } from "./lib/staging";
import { fixturesMode, loadAll, TbError } from "./lib/tb";
import type { Data } from "./types";
import { BalancesTab } from "./views/BalancesTab";
import { BurnTab } from "./views/BurnTab";
import { CreditsTab } from "./views/CreditsTab";
import { InvoicesTab } from "./views/InvoicesTab";
import { PaymentsTab } from "./views/PaymentsTab";
import { ReconTab } from "./views/ReconTab";
import { RunsTab } from "./views/RunsTab";

type Tab =
    | "recon"
    | "invoices"
    | "payments"
    | "burn"
    | "credits"
    | "balances"
    | "runs";

const TABS: { id: Tab; label: string }[] = [
    { id: "recon", label: "Recon" },
    { id: "invoices", label: "Invoices" },
    { id: "payments", label: "Payments" },
    { id: "burn", label: "Burn" },
    { id: "credits", label: "Credits" },
    { id: "balances", label: "Balances" },
    { id: "runs", label: "Runs" },
];

const INGEST_COMMAND = "python3 -m ingest.run";
const FINAL_STATUSES = new Set(["ok", "ok_credit", "accepted"]);

async function checkSession() {
    const res = await fetch("/api/auth/session");
    if (!res.ok) return false;
    const body = (await res.json()) as { authenticated?: boolean };
    return body.authenticated === true;
}

async function login(password: string) {
    const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
    });
    if (!res.ok) {
        throw new Error(res.status === 401 ? "Wrong password" : "Login failed");
    }
}

async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
}

function PasswordGate({
    error,
    onSubmit,
}: {
    error: string | null;
    onSubmit: (password: string) => void;
}) {
    const [value, setValue] = useState("");

    return (
        <div className="mx-auto mt-24 flex max-w-md flex-col gap-4 px-4">
            <Heading as="h1">Treasury</Heading>
            <Text tone="soft">
                Enter the treasury password. Tinybird tokens stay on the server.
            </Text>
            {error && <Alert intent="warning">{error}</Alert>}
            <form
                className="flex gap-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (value) onSubmit(value);
                }}
            >
                <Input
                    type="password"
                    autoFocus
                    placeholder="Password"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    className="flex-1"
                />
                <Button type="submit" className="self-start">
                    Connect
                </Button>
            </form>
        </div>
    );
}

export default function App() {
    const fixtures = fixturesMode();
    const [authenticated, setAuthenticated] = useState(fixtures);
    const [sessionChecked, setSessionChecked] = useState(fixtures);
    const [authError, setAuthError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<Data | null>(null);
    const [tab, setTab] = useState<Tab>("recon");
    const [attempt, setAttempt] = useState(0);
    const [committedAwaitingIngest, setCommittedAwaitingIngest] = useState(0);
    const [showCommittedBanner, setShowCommittedBanner] = useState(false);
    const [queuedKeys, setQueuedKeys] = useState<ReadonlySet<string>>(
        () => new Set(),
    );
    const ready = fixtures || (sessionChecked && authenticated);

    useEffect(() => {
        if (fixtures) return;

        let cancelled = false;
        checkSession()
            .then((ok) => {
                if (!cancelled) {
                    setAuthenticated(ok);
                    setSessionChecked(true);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setAuthenticated(false);
                    setSessionChecked(true);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [fixtures]);

    useEffect(() => {
        if (!ready) return;

        const retryKey = attempt;
        let cancelled = false;
        setError(null);
        setData(null);
        loadAll()
            .then((loaded) => {
                if (!cancelled && retryKey === attempt) setData(loaded);
            })
            .catch((caught: unknown) => {
                if (cancelled || retryKey !== attempt) return;

                if (
                    caught instanceof TbError &&
                    (caught.status === 401 || caught.status === 403)
                ) {
                    setAuthenticated(false);
                    setSessionChecked(true);
                    setAuthError(
                        `Session rejected (${caught.message}) - enter the password again.`,
                    );
                } else {
                    setError(
                        caught instanceof Error
                            ? caught.message
                            : String(caught),
                    );
                }
            });

        return () => {
            cancelled = true;
        };
    }, [ready, attempt]);

    const staleHours = useMemo(() => {
        const latest = data?.runs[0]?.run_at;
        return latest ? hoursSince(latest) : null;
    }, [data]);

    useEffect(() => {
        if (!data) return;

        setQueuedKeys((current) => {
            const next = new Set(current);
            for (const row of data.coverage) {
                if (FINAL_STATUSES.has(row.status)) {
                    next.delete(queuedReconKey(row.month, row.provider));
                    next.delete(queuedMeterKey(row.month, row.provider));
                }
            }
            return next.size === current.size ? current : next;
        });
    }, [data]);

    if (!sessionChecked) {
        return (
            <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-app-bg text-theme-text-strong">
                <ScrollArea axis="y" className="min-h-0 flex-1">
                    <div className="mx-auto mt-24 max-w-md px-4">
                        <Text tone="soft">Checking session...</Text>
                    </div>
                </ScrollArea>
            </div>
        );
    }

    if (!ready) {
        return (
            <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-app-bg text-theme-text-strong">
                <ScrollArea axis="y" className="min-h-0 flex-1">
                    <PasswordGate
                        error={authError}
                        onSubmit={(password) => {
                            login(password)
                                .then(() => {
                                    setAuthError(null);
                                    setAuthenticated(true);
                                    setSessionChecked(true);
                                    setAttempt((current) => current + 1);
                                })
                                .catch((caught: unknown) => {
                                    setAuthError(
                                        caught instanceof Error
                                            ? caught.message
                                            : String(caught),
                                    );
                                });
                        }}
                    />
                </ScrollArea>
            </div>
        );
    }

    return (
        <StagingProvider
            fixtures={fixtures}
            onCommitted={(changes) => {
                setCommittedAwaitingIngest(
                    (current) => current + changes.length,
                );
                setShowCommittedBanner(true);
                setQueuedKeys((current) => {
                    const next = new Set(current);
                    for (const change of changes) {
                        for (const key of queuedKeysForChange(change)) {
                            next.add(key);
                        }
                    }
                    return next;
                });
                setAttempt((current) => current + 1);
            }}
        >
            <div
                data-theme="amber"
                data-committed-awaiting-ingest={committedAwaitingIngest}
                className="flex h-dvh min-h-0 flex-col overflow-hidden bg-app-bg text-theme-text-strong"
            >
                <ScrollArea axis="y" className="min-h-0 flex-1">
                    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 pb-32 sm:px-6 sm:py-10 sm:pb-32">
                        <header className="flex flex-col gap-4 border-b border-theme-border/70 pb-5 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                                <Text
                                    size="micro"
                                    tone="soft"
                                    weight="bold"
                                    className="mb-2 uppercase tracking-wide"
                                >
                                    Operations
                                </Text>
                                <Heading as="h1" size="title">
                                    Treasury
                                </Heading>
                                <Text tone="soft" className="mt-2 max-w-3xl">
                                    Raw Tinybird tables for operator review.
                                    Edits append facts; forager folds them in on
                                    the next run.
                                </Text>
                                <SourceLegend />
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                                {fixtures && (
                                    <Chip intent="alpha">fixtures</Chip>
                                )}
                                {staleHours !== null &&
                                    staleHours <= STALE_AFTER_HOURS && (
                                        <Chip size="sm">
                                            data {Math.round(staleHours)}h old
                                        </Chip>
                                    )}
                                {!fixtures && (
                                    <Button
                                        size="sm"
                                        onClick={() => {
                                            logout().finally(() => {
                                                setAuthenticated(false);
                                                setData(null);
                                            });
                                        }}
                                    >
                                        Log out
                                    </Button>
                                )}
                                <ColorModeToggle />
                            </div>
                        </header>

                        {staleHours !== null &&
                            staleHours > STALE_AFTER_HOURS && (
                                <Alert intent="warning" title="Stale data">
                                    Last forager run was{" "}
                                    {Math.round(staleHours)}h ago. Run{" "}
                                    <code>python3 -m ingest.run</code> for fresh
                                    numbers.
                                </Alert>
                            )}

                        {showCommittedBanner && committedAwaitingIngest > 0 && (
                            <Alert
                                intent="warning"
                                title="Committed, waiting for ingest"
                            >
                                <div className="flex flex-wrap items-center gap-2">
                                    <span>
                                        {committedAwaitingIngest} changes
                                        committed. Flagged rows update after the
                                        next ingest run (
                                        <code>{INGEST_COMMAND}</code>).
                                    </span>
                                    <Button
                                        size="sm"
                                        onClick={() =>
                                            void navigator.clipboard?.writeText(
                                                INGEST_COMMAND,
                                            )
                                        }
                                    >
                                        Copy command
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={() =>
                                            setShowCommittedBanner(false)
                                        }
                                    >
                                        Dismiss
                                    </Button>
                                </div>
                            </Alert>
                        )}

                        <nav className="flex flex-wrap gap-2">
                            {TABS.map((item) => (
                                <TabButton
                                    key={item.id}
                                    active={tab === item.id}
                                    onClick={() => setTab(item.id)}
                                >
                                    {item.label}
                                </TabButton>
                            ))}
                        </nav>

                        {error && (
                            <Alert intent="warning" title="Load failed">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span>{error}</span>
                                    <Button
                                        size="sm"
                                        onClick={() => setAttempt((n) => n + 1)}
                                    >
                                        Retry
                                    </Button>
                                </div>
                            </Alert>
                        )}
                        {!error && !data && (
                            <Text tone="soft">Loading pipes...</Text>
                        )}
                        {data && tab === "recon" && (
                            <ReconTab data={data} queuedKeys={queuedKeys} />
                        )}
                        {data && tab === "invoices" && (
                            <InvoicesTab data={data} queuedKeys={queuedKeys} />
                        )}
                        {data && tab === "payments" && (
                            <PaymentsTab data={data} queuedKeys={queuedKeys} />
                        )}
                        {data && tab === "burn" && <BurnTab data={data} />}
                        {data && tab === "credits" && (
                            <CreditsTab data={data} queuedKeys={queuedKeys} />
                        )}
                        {data && tab === "balances" && (
                            <BalancesTab data={data} queuedKeys={queuedKeys} />
                        )}
                        {data && tab === "runs" && <RunsTab data={data} />}
                    </main>
                </ScrollArea>
                <CommitTray />
            </div>
        </StagingProvider>
    );
}
