'use client';

import { usePollinationsApiKey } from '@/components/PollinationsApiKeyProvider';
import { Button } from '@/components/ui/button';
import { Check, Copy, ImagePlus, Loader2, X } from 'lucide-react';
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

export function MediaUpload() {
  const { apiKey } = usePollinationsApiKey();
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
      setError(null);
      setResult(null);

      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(MEDIA_UPLOAD_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          body: formData,
        });

        if (!response.ok) {
          if (response.status === 401) throw new Error('Invalid API key');
          if (response.status === 413) throw new Error('File too large');
          throw new Error(`Upload failed (${response.status})`);
        }

        const data: UploadResult = await response.json();
        setResult(data);
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

  const handleClear = () => {
    setResult(null);
    setError(null);
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,audio/*,video/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Drop zone / upload button */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-xs cursor-pointer transition-all ${
          dragOver
            ? 'border-primary bg-accent/30'
            : 'border-border hover:border-primary/40 hover:bg-accent/10'
        }`}
      >
        {uploading ? (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        ) : (
          <ImagePlus className="size-3.5 text-muted-foreground" />
        )}
        <span className="text-muted-foreground">
          {uploading ? 'Uploading...' : 'Upload media'}
        </span>
      </div>

      {/* Result */}
      {result && (
        <div className="flex items-center gap-1.5 rounded-md bg-accent/20 px-2.5 py-2 text-xs">
          <span className="truncate flex-1 font-mono text-accent-foreground/80">
            {result.url}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleCopy}
            className="size-6 shrink-0"
          >
            {copied ? (
              <Check className="size-3 text-green-400" />
            ) : (
              <Copy className="size-3" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleClear}
            className="size-6 shrink-0"
          >
            <X className="size-3" />
          </Button>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-destructive px-1">{error}</p>
      )}
    </div>
  );
}
