// API debug panel — shows the EXACT last request sent to the model: system
// prompt + the role-mapped history, plus the raw response. Toggle with Ctrl+D
// (or load the page with ?debug). Each message row expands to its full content.

import { useState } from "react";
import type { DebugEntry } from "@/utils/debugLog";

const ROLE_STYLES: Record<string, string> = {
    system: "text-purple-300 border-purple-500",
    user: "text-yellow-300 border-yellow-600",
    assistant: "text-green-300 border-green-600",
};

function MessageRow({
    role,
    content,
}: {
    role: string;
    content: string;
}) {
    const [open, setOpen] = useState(role === "system" ? false : true);
    const style = ROLE_STYLES[role] ?? "text-gray-300 border-gray-600";
    const firstLine = content.split("\n")[0];
    const preview =
        firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine;
    const isLong = content.length > preview.length;

    return (
        <div className={`border-l-2 pl-2 ${style}`}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="text-left w-full hover:opacity-80"
            >
                <span className="font-bold uppercase text-xs mr-2">
                    {isLong ? (open ? "▾" : "▸") : "·"} {role}
                </span>
                {!open && <span className="opacity-70">{preview}</span>}
            </button>
            {open && (
                <pre className="whitespace-pre-wrap break-words text-xs mt-1 mb-2 opacity-90">
                    {content}
                </pre>
            )}
        </div>
    );
}

export function DebugPanel({
    entry,
    onClose,
}: {
    entry: DebugEntry | null;
    onClose: () => void;
}) {
    return (
        <div className="w-full max-w-2xl bg-black border-2 border-gray-600 rounded-none p-3 font-mono text-gray-200 mt-4">
            <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-gray-400">
                    🐞 API DEBUG — last request{" "}
                    <span className="text-gray-600">(Ctrl+D to hide)</span>
                </span>
                <button
                    type="button"
                    onClick={onClose}
                    className="text-xs text-red-400 hover:text-red-300 underline"
                >
                    close
                </button>
            </div>

            {!entry ? (
                <p className="text-xs text-gray-500">
                    No request captured yet — say something to the elevator.
                </p>
            ) : (
                <div className="space-y-1">
                    <div className="text-xs text-gray-500 mb-2">
                        model: <b className="text-gray-300">{entry.model}</b>
                        {"   "}reasoning_effort:{" "}
                        <b className="text-gray-300">{entry.reasoningEffort}</b>
                        {"   "}messages:{" "}
                        <b className="text-gray-300">{entry.messages.length}</b>
                    </div>

                    {entry.messages.map((m, i) => (
                        <MessageRow
                            // Debug log is a fixed snapshot; index is a stable key.
                            key={`${i}-${m.role}`}
                            role={m.role}
                            content={m.content}
                        />
                    ))}

                    <div className="border-l-2 border-blue-600 pl-2 text-blue-300 mt-2">
                        <span className="font-bold uppercase text-xs">
                            ← response{entry.error ? " (error)" : ""}
                        </span>
                        <pre className="whitespace-pre-wrap break-words text-xs mt-1 opacity-90">
                            {entry.error ?? entry.response ?? "(none)"}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
}
