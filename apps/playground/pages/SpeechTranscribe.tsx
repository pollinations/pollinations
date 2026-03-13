'use client';

import { ErrorAlert } from '@/components/ErrorAlert';
import { PageHeader } from '@/components/PageHeader';
import { usePollinationsApiKey } from '@/components/PollinationsApiKeyProvider';
import { TwoPaneView } from '@/components/TwoPaneView';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormFieldItem } from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { zodResolver } from '@hookform/resolvers/zod';
import { FileAudio, Loader2, Upload } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const TRANSCRIPTION_URL =
  'https://gen.pollinations.ai/v1/audio/transcriptions';

const MODELS = [
  { id: 'whisper-large-v3', label: 'Whisper Large v3' },
  { id: 'whisper-1', label: 'Whisper 1' },
  { id: 'scribe', label: 'ElevenLabs Scribe' },
] as const;

const RESPONSE_FORMATS = ['json', 'text', 'srt', 'verbose_json', 'vtt'] as const;

const ACCEPTED_AUDIO =
  '.mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm,audio/*,video/mp4';

const transcribeFormSchema = z.object({
  model: z.string(),
  language: z.string().optional(),
  prompt: z.string().optional(),
  response_format: z.enum(RESPONSE_FORMATS),
});

type TranscribeFormValues = z.infer<typeof transcribeFormSchema>;

export default function SpeechTranscribe() {
  const { apiKey } = usePollinationsApiKey();

  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);

  const form = useForm<TranscribeFormValues>({
    resolver: zodResolver(transcribeFormSchema),
    defaultValues: {
      model: 'whisper-large-v3',
      language: '',
      prompt: '',
      response_format: 'json',
    },
  });

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setResult(null);
    setError('');
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const onSubmit = async (data: TranscribeFormValues) => {
    if (!file) {
      setError('Please select an audio file');
      return;
    }
    if (!apiKey) {
      setError('Authentication required');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('model', data.model);
      formData.append('response_format', data.response_format);
      if (data.language) formData.append('language', data.language);
      if (data.prompt) formData.append('prompt', data.prompt);

      const response = await fetch(TRANSCRIPTION_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.error?.message || `Transcription failed (${response.status})`,
        );
      }

      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        const json = await response.json();
        if (data.response_format === 'verbose_json') {
          setResult(JSON.stringify(json, null, 2));
        } else {
          setResult(json.text || JSON.stringify(json, null, 2));
        }
      } else {
        setResult(await response.text());
      }

      if (resultRef.current) {
        resultRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transcription failed');
      console.error('Transcription error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TwoPaneView
      resultRef={resultRef}
      leftPane={
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <PageHeader
              title="Speech Transcription"
              subtitle="Transcribe audio files to text using Whisper or ElevenLabs Scribe. Supports mp3, mp4, wav, webm, and more."
            />

            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_AUDIO}
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
              className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-12 cursor-pointer transition-all ${
                dragOver
                  ? 'border-primary bg-accent/30'
                  : 'border-border hover:border-primary/40 hover:bg-accent/10'
              }`}
            >
              {file ? (
                <>
                  <FileAudio className="size-8 text-muted-foreground" />
                  <span className="text-sm text-foreground font-medium">
                    {file.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB — click or drop to
                    replace
                  </span>
                </>
              ) : (
                <>
                  <Upload className="size-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Drag & drop an audio file, or click to browse
                  </span>
                  <span className="text-xs text-muted-foreground/60">
                    mp3, mp4, wav, webm, m4a, mpeg
                  </span>
                </>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="model"
                render={({ field }) => (
                  <FormFieldItem label="Model *">
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={loading}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select model" />
                      </SelectTrigger>
                      <SelectContent>
                        {MODELS.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormFieldItem>
                )}
              />

              <FormField
                control={form.control}
                name="response_format"
                render={({ field }) => (
                  <FormFieldItem label="Output Format *">
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={loading}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select format" />
                      </SelectTrigger>
                      <SelectContent>
                        {RESPONSE_FORMATS.map((fmt) => (
                          <SelectItem key={fmt} value={fmt}>
                            {fmt.toUpperCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormFieldItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="language"
              render={({ field }) => (
                <FormFieldItem label="Language (Optional)">
                  <Textarea
                    placeholder="ISO-639-1 code, e.g. en, fr, es..."
                    disabled={loading}
                    rows={1}
                    {...field}
                  />
                </FormFieldItem>
              )}
            />

            <FormField
              control={form.control}
              name="prompt"
              render={({ field }) => (
                <FormFieldItem label="Prompt (Optional)">
                  <Textarea
                    placeholder="Optional text to guide the model's style or continue a previous segment..."
                    disabled={loading}
                    rows={2}
                    {...field}
                  />
                </FormFieldItem>
              )}
            />

            <Button
              type="submit"
              disabled={loading || !file}
              className="w-full sm:w-auto"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Transcribing...
                </>
              ) : (
                'Transcribe'
              )}
            </Button>

            <ErrorAlert message={error} />
          </form>
        </Form>
      }
      rightPane={
        result ? (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Transcription</h3>
            <div className="rounded-lg border border-border bg-accent/10 p-4">
              <pre className="whitespace-pre-wrap text-sm leading-relaxed font-mono">
                {result}
              </pre>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-2">
              <FileAudio className="size-12 mx-auto text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground/50">
                Upload an audio file and transcribe to see results here
              </p>
            </div>
          </div>
        )
      }
    />
  );
}
