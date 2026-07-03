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
import { StagingProvider } from "./lib/staging";
import { fixturesMode, loadAll, TbError } from "./lib/tb";
import {
    clearAppendToken,
    clearToken,
    getAppendToken,
    getToken,
    setAppendToken,
    setToken,
} from "./lib/token";
import type { Data } from "./types";
import { BurnTab } from "./views/BurnTab";
import { CreditsTab } from "./views/CreditsTab";
import { InvoicesTab } from "./views/InvoicesTab";
import { PaymentsTab } from "./views/PaymentsTab";
import { ReconTab } from "./views/ReconTab";
import { RunsTab } from "./views/RunsTab";

type Tab = "recon" | "invoices" | "payments" | "burn" | "credits" | "runs";

const TABS: { id: Tab; label: string }[] = [
    { id: "recon", label: "Recon" },
    { id: "invoices", label: "Invoices" },
    { id: "payments", label: "Payments" },
    { id: "burn", label: "Burn" },
    { id: "credits", label: "Credits" },
    { id: "runs", label: "Runs" },
];

function TokenGate({
    error,
    onSubmit,
}: {
    error: string | null;
    onSubmit: (token: string, appendToken: string) => void;
}) {
    const [value, setValue] = useState("");
    const [appendValue, setAppendValue] = useState("");

    return (
        <div className="mx-auto mt-24 flex max-w-md flex-col gap-4 px-4">
            <Heading as="h1">Treasury</Heading>
            <Text tone="soft">
                Paste the treasury_web read token. Add treasury_append only when
                you need editing. Tokens are stored only in this browser.
            </Text>
            {error && <Alert intent="warning">{error}</Alert>}
            <form
                className="flex gap-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (value.trim()) onSubmit(value, appendValue);
                }}
            >
                <div className="flex flex-1 flex-col gap-2">
                    <Input
                        type="password"
                        autoFocus
                        placeholder="treasury_web read token"
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                    />
                    <Input
                        type="password"
                        placeholder="append token (for editing)"
                        value={appendValue}
                        onChange={(event) => setAppendValue(event.target.value)}
                    />
                </div>
                <Button type="submit" className="self-start">
                    Connect
                </Button>
            </form>
        </div>
    );
}

export default function App() {
    const fixtures = fixturesMode();
    const [token, setTokenState] = useState(getToken());
    const [appendToken, setAppendTokenState] = useState(getAppendToken());
    const [authError, setAuthError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<Data | null>(null);
    const [tab, setTab] = useState<Tab>("recon");
    const [attempt, setAttempt] = useState(0);
    const [committedAwaitingIngest, setCommittedAwaitingIngest] = useState(0);
    const ready = fixtures || token !== "";

    useEffect(() => {
        if (!ready) return;

        const retryKey = attempt;
        let cancelled = false;
        setError(null);
        setData(null);
        loadAll(token)
            .then((loaded) => {
                if (!cancelled && retryKey === attempt) setData(loaded);
            })
            .catch((caught: unknown) => {
                if (cancelled || retryKey !== attempt) return;

                if (
                    caught instanceof TbError &&
                    (caught.status === 401 || caught.status === 403)
                ) {
                    clearToken();
                    clearAppendToken();
                    setTokenState("");
                    setAppendTokenState("");
                    setAuthError(
                        `Token rejected (${caught.message}) - paste a valid one.`,
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
    }, [ready, token, attempt]);

    const staleHours = useMemo(() => {
        const latest = data?.runs[0]?.run_at;
        return latest ? hoursSince(latest) : null;
    }, [data]);

    if (!ready) {
        return (
            <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-app-bg text-theme-text-strong">
                <ScrollArea axis="y" className="min-h-0 flex-1">
                    <TokenGate
                        error={authError}
                        onSubmit={(newToken, newAppendToken) => {
                            setToken(newToken);
                            if (newAppendToken.trim()) {
                                setAppendToken(newAppendToken);
                                setAppendTokenState(newAppendToken.trim());
                            }
                            setAuthError(null);
                            setTokenState(newToken.trim());
                        }}
                    />
                </ScrollArea>
            </div>
        );
    }

    return (
        <StagingProvider
            appendToken={appendToken}
            fixtures={fixtures}
            onCommitted={(count) => {
                setCommittedAwaitingIngest((current) => current + count);
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
                                            clearToken();
                                            clearAppendToken();
                                            setTokenState("");
                                            setAppendTokenState("");
                                            setData(null);
                                        }}
                                    >
                                        Reset tokens
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
                        {data && tab === "recon" && <ReconTab data={data} />}
                        {data && tab === "invoices" && (
                            <InvoicesTab data={data} />
                        )}
                        {data && tab === "payments" && (
                            <PaymentsTab data={data} />
                        )}
                        {data && tab === "burn" && <BurnTab data={data} />}
                        {data && tab === "credits" && (
                            <CreditsTab data={data} />
                        )}
                        {data && tab === "runs" && <RunsTab data={data} />}
                    </main>
                </ScrollArea>
                <CommitTray />
            </div>
        </StagingProvider>
    );
}
