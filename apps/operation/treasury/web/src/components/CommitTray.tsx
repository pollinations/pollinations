import { Alert, Button, Text } from "@pollinations/ui";
import { useStaging } from "../lib/staging";

export function CommitTray() {
    const { changes, committing, commitAll, discard, error } = useStaging();

    if (changes.length === 0) return null;

    return (
        <section className="fixed right-4 bottom-4 left-4 z-40 mx-auto flex max-w-4xl flex-col gap-3 rounded-md border border-theme-border bg-theme-bg-elevated p-3 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <Text weight="bold">{changes.length} staged changes</Text>
                <Button size="sm" onClick={commitAll} disabled={committing}>
                    {committing
                        ? "Committing..."
                        : `Commit ${changes.length} changes`}
                </Button>
            </div>
            <ul className="max-h-32 overflow-y-auto text-sm">
                {changes.map((change) => (
                    <li
                        key={change.id}
                        className="flex items-center justify-between gap-3 border-theme-border/60 border-t py-2 first:border-t-0"
                    >
                        <span className="min-w-0 truncate">
                            {change.summary}
                        </span>
                        <Button
                            size="sm"
                            onClick={() => discard(change.id)}
                            disabled={committing}
                        >
                            Discard
                        </Button>
                    </li>
                ))}
            </ul>
            <Text size="sm" tone="soft">
                Commits append raw rows now; derived flags update after the next
                forager ingest.
            </Text>
            {error && <Alert intent="warning">{error}</Alert>}
        </section>
    );
}
