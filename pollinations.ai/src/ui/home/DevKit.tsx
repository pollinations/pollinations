import {
    AppIcon,
    BeakerIcon,
    CloudUploadIcon,
    ContentHeader,
    cn,
    ExternalLinkButton,
    GenApiIcon,
    Heading,
    type IconProps,
    LogInIcon,
    McpIcon,
    RobotIcon,
    SproutIcon,
    Surface,
    TerminalIcon,
    Text,
    WalletIcon,
} from "@pollinations/ui";
import type { ComponentType, ReactNode } from "react";
import { usePlatformStats } from "../../data/publicStats";

type Feature = {
    title: string;
    body: string | ((modelCount: number | null) => string);
    linkLabel: string;
    href: string;
    external?: boolean;
    icon: ComponentType<IconProps>;
};

const BUILD_FOUNDATIONS: Feature[] = [
    {
        title: "One API, every model",
        body: (modelCount) =>
            `Build text, image, video, audio and multimodal features through one OpenAI-compatible API${modelCount ? ` across ${modelCount} models` : ""}.`,
        linkLabel: "Explore the API",
        href: "https://gen.pollinations.ai/docs",
        external: false,
        icon: GenApiIcon,
    },
    {
        title: "Connect user wallets",
        body: "Let users bring their own Pollen, choose a budget, expiry and access, and pay for their own usage. You avoid payment infrastructure and can earn from every connected call.",
        linkLabel: "Connect a wallet",
        href: "https://gen.pollinations.ai/docs#tag/connect-user-wallets",
        external: false,
        icon: WalletIcon,
    },
    {
        title: "Pollinations Login",
        body: "Add Pollinations Login to your app. Users connect their account and approve profile and usage access through a standard OAuth flow.",
        linkLabel: "Add Pollinations Login",
        href: "https://gen.pollinations.ai/docs#tag/connect-user-wallets",
        external: false,
        icon: LogInIcon,
    },
];

const BUILD_TOOLS: Feature[] = [
    {
        title: "Media hosting",
        body: "Upload generated images, audio and video and receive reusable URLs for apps, agents and workflows.",
        linkLabel: "Store media",
        href: "https://gen.pollinations.ai/docs#tag/media-storage",
        external: false,
        icon: CloudUploadIcon,
    },
    {
        title: "Pollinations CLI",
        body: "Generate every modality, inspect models and manage access, published models and agents from the shell.",
        linkLabel: "Use the CLI",
        href: "https://gen.pollinations.ai/docs#tag/cli",
        external: false,
        icon: TerminalIcon,
    },
    {
        title: "Pollinations MCP",
        body: "Bring generation, media, model discovery and account tools into Codex, Claude, Cursor and any MCP-capable product.",
        linkLabel: "Connect the MCP",
        href: "https://gen.pollinations.ai/docs#tag/mcp-server",
        external: false,
        icon: McpIcon,
    },
];

const BUILD_FEATURES = [...BUILD_FOUNDATIONS, ...BUILD_TOOLS];

const PUBLISH_FEATURES: Feature[] = [
    {
        title: "Publish an app",
        body: "Join the app directory, reach the Pollinations community and earn from connected usage.",
        linkLabel: "Publish an app",
        href: "https://github.com/pollinations/pollinations/issues/new?template=APP-SUBMISSION.yml",
        icon: AppIcon,
    },
    {
        title: "Publish a model",
        body: "Connect your endpoint privately, or publish it in the catalog with your own price and earn from usage.",
        linkLabel: "Publish a model",
        href: "https://gen.pollinations.ai/docs#tag/publish-a-model",
        external: false,
        icon: BeakerIcon,
    },
    {
        title: "Publish an agent",
        body: "Combine instructions, a base model and Pollinations tools into a reusable model without hosting an agent server.",
        linkLabel: "Publish an agent",
        href: "https://gen.pollinations.ai/docs#tag/publish-an-agent",
        external: false,
        icon: RobotIcon,
    },
];

function FeatureCard({
    feature,
    modelCount,
}: {
    feature: Feature;
    modelCount: number | null;
}) {
    const Icon = feature.icon;
    const body =
        typeof feature.body === "function"
            ? feature.body(modelCount)
            : feature.body;

    return (
        <Surface
            variant="card"
            className="flex h-full flex-col gap-5 p-5 sm:p-6"
        >
            <div className="flex items-center gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-theme-bg-subtle text-theme-text-strong">
                    <Icon className="size-6" />
                </div>
                <Heading as="h3" size="card">
                    {feature.title}
                </Heading>
            </div>

            <Text size="sm" className="flex-1">
                {body}
            </Text>

            <ExternalLinkButton
                href={feature.href}
                external={feature.external}
                size="sm"
                appearance="raised"
                className="self-start whitespace-nowrap"
            >
                {feature.linkLabel}
            </ExternalLinkButton>
        </Surface>
    );
}

function FeatureGroup({
    eyebrow,
    title,
    description,
    children,
}: {
    eyebrow: string;
    title: string;
    description: string;
    children: ReactNode;
}) {
    return (
        <section className="flex flex-col gap-5">
            <ContentHeader
                eyebrow={eyebrow}
                title={title}
                subtitle={description}
                className="px-1"
            />
            {children}
        </section>
    );
}

export function DevKit({ className }: { className?: string }) {
    const { data } = usePlatformStats();
    const modelCount = data?.models ?? null;

    return (
        <section className={cn("flex flex-col gap-10", className)}>
            <Surface variant="card" className="flex flex-col gap-6 p-5 sm:p-6">
                <ContentHeader
                    eyebrow="Start free"
                    title="Make your first API call"
                    subtitle="Earn Pollen through Quests, then make your first API call."
                />
                <div className="grid items-end gap-6 lg:grid-cols-[1fr_auto]">
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-theme-bg-active text-theme-text-strong">
                                <SproutIcon className="size-6" />
                            </div>
                            <Heading as="h3" size="card">
                                Win Pollen with Quests
                            </Heading>
                        </div>
                        <Text size="sm">
                            Contribute to Pollinations, earn free Pollen, and
                            spend it across every model from your own API key.
                        </Text>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                        <ExternalLinkButton
                            href="https://enter.pollinations.ai/quests"
                            external={false}
                            size="sm"
                            appearance="raised"
                            className="whitespace-nowrap"
                        >
                            Browse Quests
                        </ExternalLinkButton>
                        <ExternalLinkButton
                            href="https://enter.pollinations.ai/keys"
                            external={false}
                            size="sm"
                            appearance="raised"
                            className="whitespace-nowrap"
                        >
                            Get an API key
                        </ExternalLinkButton>
                    </div>
                </div>
            </Surface>

            <FeatureGroup
                eyebrow="Build"
                title="Tools for production AI apps"
                description="Connect users, call every model, and bring the workflow into your existing tools."
            >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {BUILD_FEATURES.map((feature) => (
                        <FeatureCard
                            key={feature.title}
                            feature={feature}
                            modelCount={modelCount}
                        />
                    ))}
                </div>
            </FeatureGroup>

            <FeatureGroup
                eyebrow="Publish and earn"
                title="Turn what you build into a product"
                description="Turn apps, models and agents into products people can discover and use."
            >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {PUBLISH_FEATURES.map((feature) => (
                        <FeatureCard
                            key={feature.title}
                            feature={feature}
                            modelCount={modelCount}
                        />
                    ))}
                </div>
            </FeatureGroup>
        </section>
    );
}
