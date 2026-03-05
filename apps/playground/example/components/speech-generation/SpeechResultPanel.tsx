'use client';

import { SharedV3Warning } from '@ai-sdk/provider';
import type { Experimental_SpeechResult } from 'ai';

interface SpeechResultPanelProps {
  result: Experimental_SpeechResult | null;
  placeholder?: string;
}

export function SpeechResultPanel({
  result,
  placeholder = 'No audio yet. Submit a prompt to generate speech.',
}: SpeechResultPanelProps) {
  // Get base64 audio data (same as images)
  const audioUrl = result?.audio?.base64
    ? `data:audio/mp3;base64,${result.audio.base64}`
    : null;

  const hasAudio = audioUrl !== null;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-4">Result</h3>
      </div>
      <div className="rounded-md border bg-muted/50 p-4 min-h-50">
        {hasAudio ? (
          <div className="space-y-4">
            <div className="rounded-md border bg-background p-3">
              <audio src={audioUrl} controls className="w-full">
                Your browser does not support the audio tag.
              </audio>
            </div>
            {result?.warnings && result.warnings.length > 0 && (
              <div className="rounded-md border bg-yellow-50 dark:bg-yellow-900/20 p-3">
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                  Warnings:
                </p>
                <ul className="text-xs text-yellow-700 dark:text-yellow-300 space-y-1">
                  {result.warnings.map((warning: SharedV3Warning, index) => (
                    <li key={index}>
                      {warning.type}:{' '}
                      {(warning as any).details || (warning as any).feature}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{placeholder}</p>
        )}
      </div>
    </div>
  );
}
