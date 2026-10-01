import {
    ContentHeader,
    InlineLink,
    LoadingStatus,
    Textarea,
} from "@pollinations/ui";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PLAY_PAGE } from "../copy/content/play";
import { LINKS } from "../copy/content/socialLinks";
import { useAuth } from "../hooks/useAuth";
import { useModelList } from "../hooks/useModelList";
import { usePageCopy } from "../hooks/usePageCopy";
import { routeHead } from "../routeMeta";
import { ModelSelector } from "../ui/components/play/ModelSelector";
import { findModelById } from "../ui/components/play/model-selection";
import { PlayGenerator } from "../ui/components/play/PlayGenerator";
import { UserMenu } from "../ui/components/UserMenu";
import { BottomScene } from "../ui/site/BottomScene";
import { HeroScene } from "../ui/site/HeroScene";
import { PageCard } from "../ui/site/PageCard";

export const Route = createFileRoute("/play")({
    head: () => routeHead("/play"),
    // The router parses every search value as text.
    validateSearch: (search: Record<string, unknown>) =>
        search as { model?: string },
    component: PlayPage,
});

function PlayPage() {
    const { model } = useSearch({ from: "/play" });
    const [selectedModel, setSelectedModel] = useState(model ?? "flux");
    const [prompt, setPrompt] = useState("");
    const { apiKey, isLoggedIn, login } = useAuth();
    const {
        allModels: registryModels,
        allowedImageModelIds,
        allowedTextModelIds,
        allowedAudioModelIds,
        isLoading: isLoadingModels,
    } = useModelList(apiKey);

    // Get translated copy
    const { copy: pageCopy, isTranslating } = usePageCopy(PLAY_PAGE);

    const allModels = useMemo(() => {
        const typeOrder: Record<string, number> = {
            image: 0,
            video: 1,
            text: 2,
            audio: 3,
        };
        const effectiveType = (m: (typeof registryModels)[0]) =>
            m.hasVideoOutput
                ? "video"
                : m.hasAudioOutput || m.type === "audio"
                  ? "audio"
                  : m.type;
        return [...registryModels].sort(
            (a, b) =>
                (typeOrder[effectiveType(a)] ?? 99) -
                (typeOrder[effectiveType(b)] ?? 99),
        );
    }, [registryModels]);

    const currentModel = findModelById(allModels, selectedModel);
    const isVideoModel = !!currentModel?.hasVideoOutput;
    const isAudioModel =
        !isVideoModel &&
        (!!currentModel?.hasAudioOutput || currentModel?.type === "audio");
    const isImageModel =
        !isVideoModel && !isAudioModel && currentModel?.type === "image";
    const promptPlaceholder = isVideoModel
        ? pageCopy.videoPlaceholder
        : isAudioModel
          ? pageCopy.audioPlaceholder
          : isImageModel
            ? pageCopy.imagePlaceholder
            : pageCopy.textPlaceholder;

    return (
        <>
            <PageCard className="pb-0 sm:pb-0">
                {/* The monitor robot, showing off something it just made. */}
                <HeroScene page="play" compactBottom>
                    {isTranslating && (
                        <LoadingStatus>Translating</LoadingStatus>
                    )}
                    <ContentHeader
                        eyebrow={null}
                        title={pageCopy.createTitle}
                        subtitle={
                            <>
                                {pageCopy.subtitlePrefix}{" "}
                                <strong>{pageCopy.subtitleBold}</strong>
                                {pageCopy.subtitleSuffix}
                            </>
                        }
                        variant="page"
                    />
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 self-start">
                        <UserMenu />
                        <InlineLink href={LINKS.enterModels} size="sm">
                            {pageCopy.pricingLinkText}
                        </InlineLink>
                    </div>
                </HeroScene>
            </PageCard>
            <PageCard className="pt-6 sm:pt-8">
                <div className="relative z-10 flex w-full flex-col gap-6 text-theme-text-base">
                    <ModelSelector
                        models={allModels}
                        selectedModel={currentModel?.id ?? selectedModel}
                        onSelectModel={setSelectedModel}
                        allowedImageModelIds={allowedImageModelIds}
                        allowedTextModelIds={allowedTextModelIds}
                        allowedAudioModelIds={allowedAudioModelIds}
                        isLoading={isLoadingModels}
                        isLoggedIn={isLoggedIn}
                    />
                    <Textarea
                        value={prompt}
                        rows={7}
                        onChange={(event) => setPrompt(event.target.value)}
                        placeholder={promptPlaceholder}
                        className="min-h-44 lg:min-h-56"
                    />
                    <PlayGenerator
                        selectedModel={selectedModel}
                        prompt={prompt}
                        currentModel={currentModel}
                        apiKey={apiKey}
                        onLoginRequired={login}
                    />
                </div>
                <BottomScene page="play" />
            </PageCard>
        </>
    );
}
