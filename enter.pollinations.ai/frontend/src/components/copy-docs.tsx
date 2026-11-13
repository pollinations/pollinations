import { CopyButton, CopyStateIcon } from "@pollinations/ui";
import type { FC } from "react";
import { genDocsUrl } from "../config.ts";

/** Sections of gen's `/docs/llm.txt`, each with its button label. */
const DOCS_LABELS = {
    api: "API docs",
    byop: "Pollinations Pay docs",
    "publish-a-model": "Model publishing docs",
    "publish-an-agent": "Agent publishing docs",
    mcp: "MCP docs",
    sandboxes: "Sandbox docs",
} as const;

export type DocsSection = keyof typeof DOCS_LABELS;

const fetchDocs = async (section: DocsSection) => {
    const res = await fetch(genDocsUrl(`/llm.txt?section=${section}`));
    if (!res.ok) throw new Error(`Docs request failed: ${res.status}`);
    return res.text();
};

// A card's docs as plain text for an AI chat: a quiet grey button, since
// copying changes nothing. The copy icon says what it does, so the label only
// names the docs; the icon turns into a check, briefly, once copied.
export const CopyDocs: FC<{ section: DocsSection }> = ({ section }) => (
    <CopyButton
        value={() => fetchDocs(section)}
        copiedTimeoutMs={1500}
        tooltip={null}
        variant="button"
        intent="neutral"
        aria-label={`Copy ${DOCS_LABELS[section]}`}
        className="gap-1.5 whitespace-nowrap"
    >
        {(copied) => (
            <>
                {DOCS_LABELS[section]}
                <CopyStateIcon copied={copied} className="h-3.5 w-3.5" />
            </>
        )}
    </CopyButton>
);
