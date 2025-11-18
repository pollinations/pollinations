import { useState } from "react";
import { Title } from "../components/ui/typography";
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
        <div className="w-full px-4">
            <div className="max-w-4xl mx-auto">
                {/* Big Play Card */}
                <div className="bg-offwhite/90 border-r-4 border-b-4 border-rose shadow-[6px_6px_0px_0px_rgba(255,105,180,1)] p-6 md:p-8">
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
                </div>
            </div>
        </div>
    );
}

export default PlayPage;
