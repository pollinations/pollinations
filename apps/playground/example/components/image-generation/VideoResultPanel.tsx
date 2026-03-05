'use client';

import { UsageCard } from '@/components/text-generation/UsageCard';
import type { GenerateImageResult } from 'ai';

interface VideoResultPanelProps {
  result: GenerateImageResult | null;
  title?: string;
  placeholder?: string;
}

export function VideoResultPanel({
  result,
  title = 'Result',
  placeholder = 'No videos yet. Submit a prompt to generate videos.',
}: VideoResultPanelProps) {
  // Convert videos to data URLs for display
  const videoUrls: string[] =
    result?.images?.map((video: any) => {
      const base64String = String(video.base64 ?? video.base64Data);
      return base64String.startsWith('data:')
        ? base64String
        : `data:video/mp4;base64,${base64String}`;
    }) ?? [];

  const hasVideos = videoUrls.length > 0;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
      </div>
      <div className="rounded-md border bg-muted/50 p-4 min-h-[260px]">
        {hasVideos ? (
          <div className="space-y-4">
            {videoUrls.map((videoUrl, index) => (
              <div key={index} className="rounded-md border bg-background p-3">
                <video
                  src={videoUrl}
                  controls
                  className="w-full h-auto rounded"
                >
                  Your browser does not support the video tag.
                </video>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{placeholder}</p>
        )}
      </div>

      {/* Usage */}
      {result?.usage && <UsageCard usage={result.usage} showSectionTitle />}
    </div>
  );
}
