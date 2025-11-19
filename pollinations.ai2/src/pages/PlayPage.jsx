import { useState } from "react";
import { Title } from "../components/ui/typography";
import { PageCard } from "../components/ui/page-card";
import { PageContainer } from "../components/ui/page-container";
import { TextGenerator } from "../components/TextGenerator";
import { PLAY_PAGE } from "../config/content";
import { ImageFeed } from "../components/play/ImageFeed";
import { PlayGenerator } from "../components/play/PlayGenerator";

/**
 * PlayPage - Main playground page
 * Allows switching between Create (generation) and Watch (feed) views
 */
function PlayPage() {
    const [view, setView] = useState("play"); // "play" or "feed"

    return (
        <PageContainer noPaddingBottom>
            <PageCard>
                {/* Introduction */}
                <div className="mb-8">
                    <div className="flex items-center gap-4 mb-3">
                        <Title spacing="none">
                            <TextGenerator
                                content={
                                    view === "play"
                                        ? PLAY_PAGE.createTitle
                                        : PLAY_PAGE.watchTitle
                                }
                            />
                        </Title>
                        <button
                            type="button"
                            onClick={() =>
                                setView(view === "play" ? "feed" : "play")
                            }
                            className="font-body text-sm text-offblack/40 hover:text-offblack/70 transition-colors whitespace-nowrap"
                        >
                            <TextGenerator
                                content={
                                    view === "play"
                                        ? PLAY_PAGE.toggleWatchOthers
                                        : PLAY_PAGE.toggleBackToPlay
                                }
                            />
                        </button>
                    </div>
                    <TextGenerator
                        content={
                            view === "play"
                                ? PLAY_PAGE.createDescription
                                : PLAY_PAGE.feedDescription
                        }
                        as="div"
                        className="font-body text-offblack/70 text-base leading-relaxed"
                    />
                </div>

                {/* Content: Play Interface or Feed */}
                {view === "play" ? <PlayGenerator /> : <ImageFeed />}
            </PageCard>
        </PageContainer>
    );
}

export default PlayPage;
