import {
    Button,
    CopyButton,
    CopyStateIcon,
    ExternalLinkIcon,
} from "@pollinations/ui";
import type { FC } from "react";
import { genDocsUrl } from "../config.ts";

/** Sections of gen's `/docs/llm.txt`: their name for screen readers and the
 * docs page. */
const DOCS = {
    api: { label: "API docs", tag: "quick-start" },
    byop: { label: "Pollinations Pay docs", tag: "pollinations-pay" },
    "publish-a-model": {
        label: "Model publishing docs",
        tag: "publish-a-model",
    },
    "publish-an-agent": {
        label: "Agent publishing docs",
        tag: "publish-an-agent",
    },
    mcp: { label: "MCP docs", tag: "mcp-servers" },
    sandboxes: { label: "Sandbox docs", tag: "sandboxes" },
} as const;

export type DocsSection = keyof typeof DOCS;

const fetchDocs = async (section: DocsSection) => {
    const res = await fetch(genDocsUrl(`/llm.txt?section=${section}`));
    if (!res.ok) throw new Error(`Docs request failed: ${res.status}`);
    return res.text();
};

// A card's docs in one quiet grey pill, like the rail's Docs row: "Docs" opens
// them, the icon copies them as plain text for an AI chat and turns into a
// check, briefly. The card's title already says which docs they are.
export const CopyDocs: FC<{ section: DocsSection }> = ({ section }) => {
    const { label, tag } = DOCS[section];
    return (
        <span className="inline-flex">
            <Button
                as="a"
                href={genDocsUrl(`#tag/${tag}`)}
                target="_blank"
                rel="noopener noreferrer"
                intent="neutral"
                aria-label={`Open ${label}`}
                className="h-9 gap-1.5 whitespace-nowrap rounded-r-none py-0 pr-3"
            >
                Docs
                <ExternalLinkIcon className="h-3.5 w-3.5" />
            </Button>
            <CopyButton
                value={() => fetchDocs(section)}
                aria-label={`Copy ${label} as text`}
                variant="button"
                intent="neutral"
                className="h-9 rounded-l-none border-l-theme-text-muted/25 py-0 pr-3.5 pl-3"
            >
                {(copied) => (
                    <CopyStateIcon copied={copied} className="h-3.5 w-3.5" />
                )}
            </CopyButton>
        </span>
    );
};
