import {
    Button,
    Chip,
    ClipboardIcon,
    CopyButton,
    PauseIcon,
    PlayIcon,
    PlusIcon,
    Surface,
    TerminalIcon,
    TrashIcon,
} from "@pollinations/ui";
import { formatPollen } from "@pollinations/ui/wallet";
import { ResourceCardHeader } from "../resource-card-header.tsx";
import { type Pricing, price, type Sandbox } from "./types.ts";

type SandboxCardProps = {
    sandbox: Sandbox;
    pricing: Pricing;
    now: number;
    // The account is at its limit, so nothing more can start or resume.
    full: boolean;
    onAction: (kind: "resume" | "extend" | "pause" | "kill") => void;
};

function timeLeft(ms: number): string {
    const minutes = Math.max(0, Math.round(ms / 60_000));
    return minutes < 60
        ? `${minutes} min`
        : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function SandboxCard({
    sandbox,
    pricing,
    now,
    full,
    onAction,
}: SandboxCardProps) {
    const running = sandbox.state === "running";
    const endAt = Date.parse(sandbox.endAt);
    const ssh = `ssh ${sandbox.sandboxID}.polli`;
    // E2B ends a run 24 hours after it starts: nothing more to add past that.
    const canExtend =
        Date.parse(sandbox.startedAt) + pricing.maxRunSeconds * 1000 - endAt >=
        600_000;

    return (
        <Surface className="flex flex-col gap-3">
            <ResourceCardHeader
                icon={<TerminalIcon className="h-4 w-4" aria-hidden="true" />}
                title={<code>{sandbox.sandboxID}</code>}
                badges={
                    <>
                        <Chip
                            intent={running ? "success" : "neutral"}
                            size="sm"
                        >
                            {sandbox.state}
                        </Chip>
                        <Chip intent="neutral" size="sm">
                            {sandbox.alias ?? sandbox.templateID}
                        </Chip>
                    </>
                }
                description={`${sandbox.cpuCount} vCPU, ${sandbox.memoryMB / 1024} GB · ${
                    running
                        ? `paid for ${timeLeft(endAt - now)} more · about ${formatPollen(price(pricing, sandbox, 3600))} Pollen an hour while running`
                        : "paused, files and memory kept, costs nothing"
                }`}
                actions={null}
            />
            <div className="flex flex-wrap items-center gap-2">
                <CopyButton
                    value={ssh}
                    variant="button"
                    intent="surface"
                    tooltip="Copy the ssh command"
                >
                    <ClipboardIcon className="h-4 w-4" />
                    <code>{ssh}</code>
                </CopyButton>
                <span className="grow" />
                {running ? (
                    <>
                        <Button
                            type="button"
                            size="sm"
                            icon={<PlusIcon />}
                            disabled={!canExtend}
                            title={
                                canExtend
                                    ? undefined
                                    : "A run lasts at most 24 hours. Pause and resume to start a new one."
                            }
                            onClick={() => onAction("extend")}
                        >
                            Add time
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            intent="neutral"
                            icon={<PauseIcon />}
                            onClick={() => onAction("pause")}
                        >
                            Pause
                        </Button>
                    </>
                ) : (
                    <Button
                        type="button"
                        size="sm"
                        icon={<PlayIcon />}
                        disabled={full}
                        title={
                            full
                                ? "The limit of running sandboxes is reached. Pause or kill one first."
                                : undefined
                        }
                        onClick={() => onAction("resume")}
                    >
                        Resume
                    </Button>
                )}
                <Button
                    type="button"
                    size="sm"
                    intent="danger"
                    icon={<TrashIcon />}
                    onClick={() => onAction("kill")}
                >
                    Kill
                </Button>
            </div>
        </Surface>
    );
}
