import { CopyButton, CopyStateIcon, cn } from "@pollinations/ui";
import type { FC } from "react";
import { genDocsUrl } from "../config.ts";

/** Sections of gen's `/docs/llm.txt`; none copies all the docs. */
export type DocsSection =
    | "api"
    | "byop"
    | "publish-a-model"
    | "publish-an-agent"
    | "mcp"
    | "sandboxes";

const fetchDocs = async (section?: DocsSection) => {
    const res = await fetch(
        genDocsUrl(`/llm.txt${section ? `?section=${section}` : ""}`),
    );
    if (!res.ok) throw new Error(`Docs request failed: ${res.status}`);
    return res.text();
};

// A card's docs as plain text for an AI chat, drawn like the cards' other
// top-right links. Both labels share one grid cell, so "Copied" never moves
// anything.
export const CopyDocs: FC<{ section: DocsSection }> = ({ section }) => (
    <CopyButton
        value={() => fetchDocs(section)}
        copiedTimeoutMs={1500}
        tooltip={null}
        data-size="sm"
        data-tone="accent"
        className="polli-link inline-flex items-center gap-1.5 whitespace-nowrap"
    >
        {(copied) => (
            <>
                <CopyStateIcon copied={copied} className="h-3.5 w-3.5" />
                <span className="grid">
                    <span
                        className={cn(
                            "col-start-1 row-start-1",
                            copied && "invisible",
                        )}
                    >
                        Copy docs
                    </span>
                    <span
                        aria-hidden={!copied}
                        className={cn(
                            "col-start-1 row-start-1",
                            !copied && "invisible",
                        )}
                    >
                        Copied
                    </span>
                </span>
            </>
        )}
    </CopyButton>
);

// On a phone the drawer hides the rail's copy icon, so the top-right corner
// mirrors the menu button with one for all the docs.
export const MobileCopyDocsButton: FC = () => (
    <CopyButton
        value={() => fetchDocs()}
        copiedTimeoutMs={1500}
        data-theme="accent"
        tooltip="Copy all docs as text"
        aria-label="Copy all docs as text"
        className="fixed right-3 top-3 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-surface-menu/80 text-theme-text-strong backdrop-blur-md hover:bg-theme-text-muted/12 [.dark_&]:hover:bg-surface-menu lg:hidden"
    >
        {(copied) => <CopyStateIcon copied={copied} className="h-5 w-5" />}
    </CopyButton>
);
