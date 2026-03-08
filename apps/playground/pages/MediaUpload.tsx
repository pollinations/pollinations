'use client';

import { ErrorAlert } from '@/components/ErrorAlert';
import { PageHeader } from '@/components/PageHeader';
import { usePollinationsApiKey } from '@/components/PollinationsApiKeyProvider';
import { TwoPaneView } from '@/components/TwoPaneView';
import { Button } from '@/components/ui/button';
import { Check, Copy, ImagePlus, Loader2 } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

const MEDIA_UPLOAD_URL = 'https://media.pollinations.ai/upload';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface UploadResult {
  id: string;
  url: string;
  contentType: string;
  size: number;
  duplicate: boolean;
}

function MediaPreview({
  url,
  contentType,
}: {
  url: string;
  contentType: string;
}) {
  if (contentType.startsWith('image/')) {
    return (
      <img
        src={url}
        alt="Uploaded media"
        className="w-full rounded-lg border border-border"
      />
    );
  }
  if (contentType.startsWith('video/')) {
    return (
      <video
        src={url}
        controls
        className="w-full rounded-lg border border-border"
      />
    );
  }
  if (contentType.startsWith('audio/')) {
    return (
      <audio src={url} controls className="w-full" />
    );
  }
  return (
    <p className="text-sm text-muted-foreground">
      Preview not available for this file type.
    </p>
  );
}

export default function MediaUpload() {
  const { apiKey } = usePollinationsApiKey();
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!apiKey) {
        setError('Authentication required');
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError('File too large (max 10MB)');
        return;
      }

      setUploading(true);
      setError('');
      setResult(null);

      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(MEDIA_UPLOAD_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: formData,
        });

        if (!response.ok) {
          if (response.status === 401) throw new Error('Invalid API key');
          if (response.status === 413) throw new Error('File too large');
          throw new Error(`Upload failed (${response.status})`);
        }

        const data: UploadResult = await response.json();
        setResult(data);

        if (resultRef.current) {
          resultRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setUploading(false);
      }
    },
    [apiKey],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const handleCopy = async () => {
    if (!result?.url) return;
    await navigator.clipboard.writeText(result.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <TwoPaneView
      resultRef={resultRef}
      leftPane={
        <div className="space-y-4">
          <PageHeader
            title="Media Upload"
            subtitle="Upload images, audio, or video files to get a shareable URL. Max 10MB per file."
          />

          <input
            ref={inputRef}
            type="file"
            accept="image/*,audio/*,video/*"
            onChange={handleFileChange}
            className="hidden"
          />

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-16 cursor-pointer transition-all ${
              dragOver
                ? 'border-primary bg-accent/30'
                : 'border-border hover:border-primary/40 hover:bg-accent/10'
            }`}
          >
            {uploading ? (
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            ) : (
              <ImagePlus className="size-8 text-muted-foreground" />
            )}
            <span className="text-sm text-muted-foreground">
              {uploading
                ? 'Uploading...'
                : 'Drag & drop a file here, or click to browse'}
            </span>
            <span className="text-xs text-muted-foreground/60">
              Supports images, audio, and video (max 10MB)
            </span>
          </div>

          {result && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Media URL</label>
              <div className="flex items-center gap-2 rounded-md bg-accent/20 px-3 py-2.5">
                <span className="truncate flex-1 font-mono text-xs text-accent-foreground/80">
                  {result.url}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  className="shrink-0 h-7 px-2"
                >
                  {copied ? (
                    <Check className="size-3.5 text-green-400" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </Button>
              </div>
              {result.duplicate && (
                <p className="text-xs text-muted-foreground">
                  This file was already uploaded previously.
                </p>
              )}
            </div>
          )}

          <ErrorAlert message={error} />
        </div>
      }
      rightPane={
        result ? (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Preview</h3>
            <MediaPreview url={result.url} contentType={result.contentType} />
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Type: {result.contentType}</p>
              <p>Size: {(result.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-2">
              <ImagePlus className="size-12 mx-auto text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground/50">
                Upload a file to see a preview here
              </p>
            </div>
          </div>
        )
      }
    />
  );
}
