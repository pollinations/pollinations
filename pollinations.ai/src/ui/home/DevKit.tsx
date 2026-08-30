import {
    AppIcon,
    BeakerIcon,
    CloudUploadIcon,
    cn,
    GenApiIcon,
    type IconProps,
    McpIcon,
    RobotIcon,
    TerminalIcon,
    WalletIcon,
} from "@pollinations/ui";
import type { ComponentType } from "react";
import { usePlatformStats } from "../../data/publicStats";
import { ArrowLink, Card, PixelLabel, SectionHeader } from "../site/kit";

type Tool = {
    label: string;
    title: string;
    body: string | ((modelCount: number | null) => string);
    linkLabel: string;
    href: string;
    icon: ComponentType<IconProps>;
    wide?: boolean;
};

const TOOLS: Tool[] = [
    {
        label: "API",
        title: "One API, every model",
        body: (modelCount) =>
            `Build text, image, video, audio and multimodal features through one OpenAI-compatible API${modelCount ? ` across ${modelCount} models` : ""}.`,
        linkLabel: "Explore the API",
        href: "https://gen.pollinations.ai/docs",
        icon: GenApiIcon,
        wide: true,
    },
    {
        label: "Wallet",
        title: "Embed the Pollinations wallet",
        body: "Let users bring their own Pollen and control their budget, expiry and access. You avoid payment infrastructure and the usage bill—and can earn from their activity.",
        linkLabel: "Connect Wallet",
        href: "https://gen.pollinations.ai/docs#tag/connect-user-wallets",
        icon: WalletIcon,
        wide: true,
    },
    {
        label: "Apps",
        title: "Publish an app",
        body: "Join the app directory, reach the Pollinations community and earn from connected usage.",
        linkLabel: "Publish an app",
        href: "https://github.com/pollinations/pollinations/issues/new?template=APP-SUBMISSION.yml",
        icon: AppIcon,
    },
    {
        label: "Models",
        title: "Publish a model",
        body: "Connect your endpoint privately, or publish it in the catalog with your own price and earn from usage.",
        linkLabel: "Publish a model",
        href: "https://gen.pollinations.ai/docs#tag/publish-a-model",
        icon: BeakerIcon,
    },
    {
        label: "Agents",
        title: "Publish an agent",
        body: "Combine instructions, a base model and Pollinations tools into a reusable model without hosting an agent server.",
        linkLabel: "Publish an agent",
        href: "https://gen.pollinations.ai/docs#tag/publish-an-agent",
        icon: RobotIcon,
    },
    {
        label: "Media",
        title: "Media hosting",
        body: "Upload generated images, audio and video and receive reusable URLs for apps, agents and workflows.",
        linkLabel: "Store media",
        href: "https://gen.pollinations.ai/docs#tag/media-storage",
        icon: CloudUploadIcon,
    },
    {
        label: "Terminal",
        title: "Pollinations CLI",
        body: "Generate every modality, inspect models and manage access, published models and agents from the shell.",
        linkLabel: "Use the CLI",
        href: "https://gen.pollinations.ai/docs#tag/cli",
        icon: TerminalIcon,
        wide: true,
    },
    {
        label: "AI tools",
        title: "Pollinations MCP",
        body: "Bring generation, media, model discovery and account tools into Codex, Claude, Cursor and any MCP-capable product.",
        linkLabel: "Connect the MCP",
        href: "https://gen.pollinations.ai/docs#tag/mcp-server",
        icon: McpIcon,
        wide: true,
    },
];

export function DevKit() {
    const { data } = usePlatformStats();

    return (
        <section className="flex flex-col gap-7">
            <SectionHeader
                eyebrow="Dev kit"
                title="Everything you need to build."
                subtitle="Create, connect, publish and automate with Pollinations."
                action={
                    <ArrowLink href="https://gen.pollinations.ai/docs">
                        Read the developer docs
                    </ArrowLink>
                }
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {TOOLS.map((tool) => {
                    const Icon = tool.icon;
                    const body =
                        typeof tool.body === "function"
                            ? tool.body(data?.models ?? null)
                            : tool.body;

                    return (
                        <Card
                            key={tool.label}
                            className={cn(
                                "gap-5 p-5 sm:p-6",
                                tool.wide && "sm:col-span-2",
                            )}
                        >
                            <div className="flex items-center gap-3">
                                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-theme-bg-subtle text-theme-text-strong">
                                    <Icon className="size-6" />
                                </div>
                                <div className="flex min-w-0 flex-col gap-1">
                                    <PixelLabel>{tool.label}</PixelLabel>
                                    <h3 className="font-body text-lg font-semibold leading-tight text-theme-text-strong sm:text-xl">
                                        {tool.title}
                                    </h3>
                                </div>
                            </div>

                            <p className="flex-1 text-sm leading-relaxed text-theme-text-base">
                                {body}
                            </p>

                            <ArrowLink
                                href={tool.href}
                                className="mt-auto pt-1"
                            >
                                {tool.linkLabel}
                            </ArrowLink>
                        </Card>
                    );
                })}
            </div>
        </section>
    );
}
