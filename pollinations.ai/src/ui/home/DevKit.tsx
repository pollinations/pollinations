import { Surface } from "@pollinations/ui";
import type { ReactNode } from "react";
import { HOVER_LIFT } from "../site/mockup";
import { SectionHeader } from "../site/PageHeader";

type Tool = {
    label: string;
    title: string;
    body: ReactNode;
    linkLabel: string;
    href: string;
};

/**
 * Six, not five. `minmax(360px,1fr)` resolves to 3 / 2 / 1 columns across
 * desktop, tablet and mobile, and six divides evenly at all three — five
 * always orphaned one. Wallet and Earn were cut because "Same API. Your
 * choice who pays." and "How the money moves" already tell that story twice;
 * Open source moved to /community, which opens with it.
 */
const TOOLS: Tool[] = [
    {
        label: "Generate",
        title: "All the models",
        body: "69 text, 28 image, 13 video, 15 audio, plus embeddings, 3D and realtime voice. And 86 more brought by the community through BYOM — a catalogue that grows without us.",
        linkLabel: "Browse the model list",
        href: "https://gen.pollinations.ai/models",
    },
    {
        label: "Connect",
        title: "Sign in with Pollinations",
        body: "OAuth 2.1 with PKCE, plus device flow for CLIs and desktop apps. Users approve once and spend from their own wallet — with a budget and expiry they set, revocable any time.",
        linkLabel: "Read the BYOP guide",
        href: "https://gen.pollinations.ai/docs",
    },
    {
        label: "Drop-in",
        title: "Works with your OpenAI SDK",
        body: "Change the base URL and keep your client. Streaming is byte-for-byte the OpenAI format, with tool calling, structured output and image input.",
        linkLabel: "See the API reference",
        href: "https://gen.pollinations.ai/docs",
    },
    {
        label: "SDK",
        title: "Typed client, React hooks",
        body: (
            <>
                <code className="font-pixel">@pollinations/sdk</code> covers
                every modality, plus balance, keys and OAuth. React hooks for
                auth, balance and the model catalogue.
            </>
        ),
        linkLabel: "Read the SDK docs",
        href: "https://www.npmjs.com/package/@pollinations/sdk",
    },
    {
        label: "Terminal",
        title: "Generate from the shell",
        body: (
            <>
                <code className="font-pixel">polli</code> does every modality,
                plus keys, usage and quests.{" "}
                <code className="font-pixel">--json</code> on stdout and a
                shipped SKILL.md, so agents can drive it.
            </>
        ),
        linkLabel: "Install polli CLI",
        href: "https://www.npmjs.com/package/@pollinations/cli",
    },
    {
        label: "Agents",
        title: "MCP server",
        body: (
            <>
                <code className="font-pixel">@pollinations/mcp</code> exposes
                generation, vision, search, speech and your balance as tools.
                Runs with npx in Claude Code, Cursor or Codex.
            </>
        ),
        linkLabel: "Add the MCP server",
        href: "https://www.npmjs.com/package/@pollinations/mcp",
    },
];

export function DevKit() {
    return (
        <section className="flex flex-col gap-7">
            <SectionHeader
                eyebrow="Dev kit"
                title="Everything already in your hands."
                aside={
                    <a
                        href="https://gen.pollinations.ai/docs"
                        className="text-sm font-semibold text-theme-text-soft"
                    >
                        Need the details? read the API docs →
                    </a>
                }
            />

            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-5">
                {TOOLS.map((tool) => (
                    <Surface
                        key={tool.label}
                        variant="card"
                        className={`flex flex-col gap-2.5 p-7 ${HOVER_LIFT}`}
                    >
                        <p className="font-pixel text-xs tracking-wider text-theme-text-soft uppercase">
                            {tool.label}
                        </p>
                        <h3 className="font-subheading text-xl text-theme-text-strong">
                            {tool.title}
                        </h3>
                        <p className="text-sm leading-relaxed text-theme-text-base">
                            {tool.body}
                        </p>
                        <a
                            href={tool.href}
                            className="mt-auto pt-2 text-sm font-semibold text-theme-text-soft"
                        >
                            {tool.linkLabel} →
                        </a>
                    </Surface>
                ))}
            </div>
        </section>
    );
}
