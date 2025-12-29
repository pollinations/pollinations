import { useState, useEffect, useRef } from "react";
import { PLAY_PAGE } from "../../../copy/content/play";
import { usePageCopy } from "../../../hooks/usePageCopy";

interface ImageFeedProps {
  onFeedPromptChange: (prompt: string) => void;
}

interface FeedItem {
  content: string;
  prompt: string;
  model: string;
}

interface ImageQueueItem {
  imageURL: string;
  prompt: string;
  model: string;
  status?: string;
}

export function ImageFeed({ onFeedPromptChange }: ImageFeedProps) {
  const { copy } = usePageCopy(PLAY_PAGE);
  const seenImages = useRef<Set<string>>(new Set());
  const imageQueue = useRef<ImageQueueItem[]>([]);
  const MAX_QUEUE_SIZE = 10;

  const [currentDisplay, setCurrentDisplay] = useState<FeedItem | null>(null);

  // Update parent with current feed prompt
  useEffect(() => {
    if (currentDisplay?.prompt) {
      onFeedPromptChange(currentDisplay.prompt);
    }
  }, [currentDisplay, onFeedPromptChange]);

  // Image feed - listen to all models
  useEffect(() => {
    const eventSource = new EventSource("https://image.pollinations.ai/feed");
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.imageURL && data.status === "end_generating") {
          if (
            !seenImages.current.has(data.imageURL) &&
            imageQueue.current.length < MAX_QUEUE_SIZE
          ) {
            seenImages.current.add(data.imageURL);
            imageQueue.current.push(data);
          }
        }
      } catch (error) {
        console.error("Image feed error:", error);
      }
    };
    return () => eventSource.close();
  }, []);

  // Update display
  useEffect(() => {
    const interval = setInterval(() => {
      if (imageQueue.current.length > 0) {
        const item = imageQueue.current.shift();
        if (item) {
          setCurrentDisplay({
            content: item.imageURL,
            prompt: item.prompt || copy.noPromptFallback,
            model: item.model,
          });
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [copy.noPromptFallback]);

  return (
    <div
      className="w-full flex flex-col gap-4"
      style={{ maxHeight: "calc(100vh - 280px)" }}
    >
      <div
        className="flex flex-col md:flex-row gap-4 md:gap-6 overflow-hidden"
        style={{ height: "calc(100vh - 320px)" }}
      >
        {/* Main display - full width on mobile, 2/3 on desktop */}
        <div className="flex-1 md:flex-[2] relative bg-surface-elevated rounded-sub-card overflow-hidden flex items-center justify-center min-h-0">
          {!currentDisplay ? (
            <div className="flex items-center justify-center h-full text-center py-24 text-text-caption font-body">
              <p>{copy.waitingForImages}</p>
            </div>
          ) : (
            <a
              href={currentDisplay.content}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full h-full overflow-hidden hover:opacity-90 transition-opacity"
            >
              <img
                src={currentDisplay.content}
                alt={currentDisplay.prompt}
                className="w-full h-full object-cover"
              />
            </a>
          )}
        </div>

        {/* Prompt info - below image on mobile, sidebar on desktop */}
        <div className="shrink-0 md:flex-1 bg-surface-elevated rounded-sub-card p-4 md:p-6 md:overflow-auto scrollbar-hide">
          <div className="flex flex-col md:space-y-4">
            <div>
              <p className="font-headline text-xs uppercase tracking-wider font-black text-text-body-main mb-2">
                {copy.feedPromptLabel}
              </p>
              <p className="font-body text-sm text-text-body-secondary break-words overflow-y-auto overflow-x-hidden scrollbar-hide h-[6.5rem] md:h-auto">
                {currentDisplay?.prompt || copy.noPromptAvailable}
              </p>
            </div>
            <div className="mt-3 md:mt-0">
              <p className="font-headline text-xs uppercase tracking-wider font-black text-text-body-main mb-1">
                {copy.feedModelLabel}
              </p>
              <p className="font-mono text-xs text-text-body-secondary truncate">
                {currentDisplay?.model || copy.noModelFallback}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
