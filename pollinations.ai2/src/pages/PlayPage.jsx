import { useState } from "react";
import { Title } from "../components/ui/typography";
import { PageCard } from "../components/ui/page-card";
import { PageContainer } from "../components/ui/page-container";
import { TextGenerator } from "../components/TextGenerator";
import { PLAY_DESCRIPTION, FEED_DESCRIPTION } from "../config/content";
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
                            {view === "play" ? "Create" : "Watch"}
                        </Title>
                        <button
                            type="button"
                            onClick={() =>
                                setView(view === "play" ? "feed" : "play")
                            }
                            className="font-body text-sm text-offblack/40 hover:text-offblack/70 transition-colors whitespace-nowrap"
                        >
                            {view === "play"
                                ? "Watch what others are making"
                                : "Back to Play"}
                        </button>
                    </div>
                    <TextGenerator
                        text={
                            view === "play"
                                ? PLAY_DESCRIPTION.prompt
                                : FEED_DESCRIPTION.prompt
                        }
                        seed={
                            view === "play"
                                ? PLAY_DESCRIPTION.seed
                                : FEED_DESCRIPTION.seed
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
