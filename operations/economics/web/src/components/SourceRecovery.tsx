import { Alert, Button } from "@pollinations/ui";
import { useState } from "react";
import { fetchPipe } from "../lib/tb";

const SOURCES = [
    ["Bank", "economics_bank_ledger_api"],
    ["Vendor", "economics_vendor_ledger_api"],
    ["Pollen", "economics_pollen_usage_api"],
] as const;

// Source reads do not need vendor rules. Do not initialize an empty registry
// or present partial calculations when the private catalog cannot be trusted.
export function SourceRecovery({ reason }: { reason: string }) {
    const [pending, setPending] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    async function download(label: string, pipe: string) {
        setPending(pipe);
        setError(null);
        try {
            const rows = await fetchPipe(pipe);
            const url = URL.createObjectURL(
                new Blob([JSON.stringify(rows, null, 2)], {
                    type: "application/json",
                }),
            );
            const link = document.createElement("a");
            link.href = url;
            link.download = `${label.toLowerCase()}-records.json`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (caught) {
            setError(
                caught instanceof Error ? caught.message : "Source unavailable",
            );
        } finally {
            setPending(null);
        }
    }
    return (
        <main className="mx-auto flex max-w-3xl flex-col gap-5 p-8">
            <h1 className="text-2xl font-semibold">Economics</h1>
            <Alert intent="warning" title="Vendor rules unavailable">
                <p>{reason}</p>
                <p>
                    Results and forecasts are unavailable until the journals
                    load. Recorded source data can still be downloaded below.
                </p>
            </Alert>
            <Button onClick={() => window.location.reload()}>
                Retry journals
            </Button>
            <div className="flex flex-wrap gap-3">
                {SOURCES.map(([label, pipe]) => (
                    <Button
                        key={pipe}
                        disabled={pending != null}
                        onClick={() => void download(label, pipe)}
                    >
                        {pending === pipe
                            ? "Loading…"
                            : `Download ${label} records`}
                    </Button>
                ))}
            </div>
            {error && <p role="alert">{error}</p>}
        </main>
    );
}
