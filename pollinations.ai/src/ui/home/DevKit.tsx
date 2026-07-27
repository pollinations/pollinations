import type { ReactNode } from "react";
import { usePlatformStats } from "../../data/publicStats";
import {
    ArrowLink,
    Card,
    CardGrid,
    PixelLabel,
    SectionHeader,
} from "../site/kit";

type Tool = {
    label: string;
    title: string;
    /** null when the card's body is computed from live data. */
    body: ReactNode;
    linkLabel: string;
    href: string;
};

/**
 * "141 text, 51 image, 13 video, 18 audio", from the same /models response the
 * hero already fetches — no second request, and no number that can go stale.
 */
function modelSummary(
    byCategory: Record<string, number>,
    community: number,
): string {
    const named = (["text", "image", "video", "audio"] as const)
        .map((key) => (byCategory[key] ? `${byCategory[key]} ${key}` : null))
        .filter(Boolean)
        .join(", ");
    const rest = ["embedding", "3d", "realtime"].reduce(
        (sum, key) => sum + (byCategory[key] ?? 0),
        0,
    );
    const tail = rest
        ? `, plus ${rest} for embeddings, 3D and realtime voice`
        : "";
    return `${named}${tail}. ${community} of them are community models published through BYOM — a catalogue that grows without us.`;
}

/**
 * Six, not five. `minmax(320px,1fr)` resolves to 3 / 2 / 1 columns across
 * desktop, tablet and mobile, and six divides evenly at all three — five
 * always orphaned one. Wallet and Earn were cut because "Same API. Your
 * choice who pays." and "How the money moves" already tell that story twice;
 * Open source moved to /community, which opens with it.
 */
const TOOLS: Tool[] = [
    {
        label: "Generate",
        // Counted live — see modelSummary() below. The old copy said "69 text,
        // 28 image … 86 more" against a real 141/51/95, so it understated the
        // catalogue by half while publicStats.ts claimed nothing was hardcoded.
        title: "All the models",
        body: null,
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
    const { data } = usePlatformStats();

    return (
        <section className="flex flex-col gap-7">
            <SectionHeader
                eyebrow="Dev kit"
                title="Everything already in your hands."
                action={
                    <ArrowLink href="https://gen.pollinations.ai/docs">
                        Need the details? read the API docs
                    </ArrowLink>
                }
            />

            <CardGrid>
                {TOOLS.map((tool) => (
                    <Card key={tool.label} className="gap-2.5 p-7">
                        <PixelLabel>{tool.label}</PixelLabel>
                        <h3 className="font-subheading text-xl text-theme-text-strong">
                            {tool.title}
                        </h3>
                        <p className="text-sm leading-relaxed text-theme-text-base">
                            {tool.body ??
                                (data
                                    ? modelSummary(
                                          data.byCategory,
                                          data.community,
                                      )
                                    : "Text, image, video and audio models, plus embeddings, 3D and realtime voice — with more brought by the community through BYOM.")}
                        </p>
                        <ArrowLink href={tool.href} className="mt-auto pt-2">
                            {tool.linkLabel}
                        </ArrowLink>
                    </Card>
                ))}
            </CardGrid>
        </section>
    );
}
