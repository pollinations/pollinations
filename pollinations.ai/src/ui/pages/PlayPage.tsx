import { useMemo, useState } from "react";
import { PLAY_PAGE } from "../../copy/content/play";
import { LINKS } from "../../copy/content/socialLinks";
import { useAuth } from "../../hooks/useAuth";
import { useModelList } from "../../hooks/useModelList";
import { usePageCopy } from "../../hooks/usePageCopy";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { ModelSelector } from "../components/play/ModelSelector";
import { PlayGenerator } from "../components/play/PlayGenerator";
import { UserMenu } from "../components/UserMenu";
import { Button } from "../components/ui/button";
import { PageCard } from "../components/ui/page-card";
import { PageContainer } from "../components/ui/page-container";
import { Body, Title } from "../components/ui/typography";

function PlayPage() {
    const [selectedModel, setSelectedModel] = useState("flux");
    const [prompt, setPrompt] = useState("");
    const { apiKey } = useAuth();
    const {
        imageModels,
        textModels,
        audioModels,
        allModels: registryModels,
        allowedImageModelIds,
        allowedTextModelIds,
        allowedAudioModelIds,
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

    const currentModel = allModels.find((m) => m.id === selectedModel);
    const isVideoModel = !!currentModel?.hasVideoOutput;
    const isAudioModel = !isVideoModel && (!!currentModel?.hasAudioOutput || currentModel?.type === "audio");
    const isImageModel = !isVideoModel && !isAudioModel && imageModels.some((m) => m.id === selectedModel);
    const promptPlaceholder = isVideoModel
        ? pageCopy.videoPlaceholder
        : isAudioModel
          ? pageCopy.audioPlaceholder
          : isImageModel
            ? pageCopy.imagePlaceholder
            : pageCopy.textPlaceholder;

    return (
        <PageContainer>
            <PageCard isTranslating={isTranslating}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-8">
                    <Title spacing="none">{pageCopy.createTitle}</Title>
                    <UserMenu />
                </div>

                <div className="mb-6">
                    <Body className="mb-3">{pageCopy.createDescription}</Body>
                    <Button
                        as="a"
                        href={LINKS.enter}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="iconText"
                        className="inline-flex"
                    >
                        <span className="font-headline text-sm md:text-base font-black uppercase tracking-wider text-text-body-main">
                            {pageCopy.pricingLinkText}
                        </span>
                        <ExternalLinkIcon className="w-3 h-3 md:w-4 md:h-4 text-text-brand" />
                    </Button>
                </div>

                <ModelSelector
                    models={allModels}
                    selectedModel={selectedModel}
                    onSelectModel={setSelectedModel}
                    allowedImageModelIds={allowedImageModelIds}
                    allowedTextModelIds={allowedTextModelIds}
                    allowedAudioModelIds={allowedAudioModelIds}
                />

                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={promptPlaceholder}
                            className="min-h-[100px] p-3 border border-border-main rounded bg-transparent font-bold text-text-body-main focus:outline-none focus:ring-2 focus:ring-border-brand resize-none"
                        />
                    </div>
                    <PlayGenerator
                        selectedModel={selectedModel}
                        prompt={prompt}
                        imageModels={imageModels}
                        textModels={textModels}
                        audioModels={audioModels}
                        apiKey={apiKey || ""}
                    />
                </div>
            </PageCard>
        </PageContainer>
    );
}

export default PlayPage;
