'use client';

import { UsageCard } from '@/components/text-generation/UsageCard';
import type { GenerateImageResult } from 'ai';
import { MaximizeIcon } from 'lucide-react';
import { useState } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';

interface ImageResultPanelProps {
  result: GenerateImageResult | null;
  title?: string;
  placeholder?: string;
}

export function ImageResultPanel({
  result,
  title = 'Result',
  placeholder = 'No images yet. Submit a prompt to generate images.',
}: ImageResultPanelProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number>(-1);

  // Convert images to data URLs for display
  const imageUrls: string[] =
    result?.images?.map((img: any) => {
      const base64String = String(img.base64 ?? img.base64Data);
      return base64String.startsWith('data:')
        ? base64String
        : `data:${img.mediaType ?? 'image/jpeg'};base64,${base64String}`;
    }) ?? [];

  const hasImages = imageUrls.length > 0;

  // Prepare slides for lightbox
  const slides = imageUrls.map((url) => ({ src: url }));

  return (
    <>
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-4">{title}</h3>
        </div>
        <div className="rounded-md border bg-muted/50 p-4 min-h-[260px]">
          {hasImages ? (
            <div className="space-y-4">
              {imageUrls.map((imageUrl, index) => (
                <div
                  key={index}
                  className="group relative rounded-md border bg-background p-3 cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => setLightboxIndex(index)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt={`Generated image ${index + 1}`}
                    className="w-full h-auto rounded"
                  />
                  {/* Zoom icon overlay */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors rounded">
                    <MaximizeIcon className="text-white opacity-0 group-hover:opacity-100 transition-opacity size-8" />
                  </div>
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

      {/* Lightbox */}
      <Lightbox
        open={lightboxIndex >= 0}
        close={() => setLightboxIndex(-1)}
        slides={slides}
        index={lightboxIndex}
      />
    </>
  );
}
