'use client';

import { useState, useRef, useCallback } from 'react';

const TEXT_MODELS = [
  'openai', 'openai-fast', 'openai-large',
  'gemini', 'gemini-fast', 'gemini-large', 'gemini-search',
  'claude', 'claude-fast', 'claude-large',
  'mistral', 'deepseek', 'grok',
  'perplexity-fast', 'perplexity-reasoning',
  'qwen-coder', 'kimi', 'nova-fast', 'glm', 'minimax',
];

const IMAGE_MODELS = [
  'flux', 'turbo', 'kontext',
  'nanobanana', 'nanobanana-pro',
  'seedream', 'seedream-pro',
  'gptimage', 'gptimage-large',
  'zimage',
];

const VIDEO_MODELS = ['veo', 'seedance', 'seedance-pro'];

const VOICES = [
  'alloy', 'echo', 'fable', 'onyx', 'shimmer',
  'coral', 'verse', 'ballad', 'ash', 'sage',
];

const SIZES = [
  '1024x1024', '1792x1024', '1024x1792',
  '512x512', '2048x2048',
];

type Tab = 'text' | 'image' | 'speech';

export default function Playground() {
  const [tab, setTab] = useState<Tab>('text');

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-4">
        <h1 className="text-xl font-bold tracking-tight">
          <span className="text-emerald-400">Pollinations</span> Playground
        </h1>
        <nav className="flex gap-1 ml-8">
          {(['text', 'image', 'speech'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>
      <main className="flex-1 p-6">
        {tab === 'text' && <TextPanel />}
        {tab === 'image' && <ImagePanel />}
        {tab === 'speech' && <SpeechPanel />}
      </main>
    </div>
  );
}

/* ─── Text Generation ──────────────────────────────────────────────── */

function TextPanel() {
  const [model, setModel] = useState('openai');
  const [prompt, setPrompt] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setOutput('');
    abortRef.current = new AbortController();

    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt.trim()) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    try {
      const res = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          model,
          messages,
          stream: streaming,
        }),
      });

      if (!res.ok) {
        setOutput(`Error: ${res.status} ${res.statusText}`);
        return;
      }

      if (streaming && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let result = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                result += delta;
                setOutput(result);
              }
            } catch {
              // skip malformed chunks
            }
          }
        }
      } else {
        const data = await res.json();
        setOutput(data.choices?.[0]?.message?.content || JSON.stringify(data, null, 2));
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setOutput(`Error: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  }, [prompt, systemPrompt, model, streaming]);

  const stop = () => abortRef.current?.abort();

  return (
    <div className="max-w-4xl mx-auto grid gap-4">
      <div className="flex gap-3 items-end flex-wrap">
        <Field label="Model">
          <Select value={model} onChange={setModel} options={TEXT_MODELS} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-gray-400 pb-1">
          <input
            type="checkbox"
            checked={streaming}
            onChange={(e) => setStreaming(e.target.checked)}
            className="accent-emerald-500"
          />
          Stream
        </label>
      </div>

      <Field label="System Prompt (optional)">
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={2}
          className="input-field"
          placeholder="You are a helpful assistant..."
        />
      </Field>

      <Field label="Prompt">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          className="input-field"
          placeholder="Ask anything..."
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate();
          }}
        />
      </Field>

      <div className="flex gap-2">
        <ActionButton onClick={generate} loading={loading} label="Generate" />
        {loading && (
          <button onClick={stop} className="btn-secondary">
            Stop
          </button>
        )}
      </div>

      {output && (
        <div className="result-card whitespace-pre-wrap text-sm leading-relaxed">
          {output}
        </div>
      )}
    </div>
  );
}

/* ─── Image Generation ─────────────────────────────────────────────── */

function ImagePanel() {
  const [model, setModel] = useState('flux');
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('1024x1024');
  const [enhance, setEnhance] = useState(false);
  const [nologo, setNologo] = useState(true);
  const [imageUrl, setImageUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const allModels = [...IMAGE_MODELS, ...VIDEO_MODELS];
  const isVideo = VIDEO_MODELS.includes(model);

  const generate = useCallback(async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setImageUrl('');

    const params = new URLSearchParams({
      model,
      seed: Math.floor(Math.random() * 2147483647).toString(),
      nologo: nologo ? 'true' : 'false',
      enhance: enhance ? 'true' : 'false',
    });

    if (!isVideo) {
      const [w, h] = size.split('x');
      params.set('width', w);
      params.set('height', h);
    }

    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params}`;
    setImageUrl(url);
    setLoading(false);
  }, [prompt, model, size, enhance, nologo, isVideo]);

  return (
    <div className="max-w-4xl mx-auto grid gap-4">
      <div className="flex gap-3 items-end flex-wrap">
        <Field label="Model">
          <Select value={model} onChange={setModel} options={allModels} />
        </Field>
        {!isVideo && (
          <Field label="Size">
            <Select value={size} onChange={setSize} options={SIZES} />
          </Field>
        )}
        <label className="flex items-center gap-2 text-sm text-gray-400 pb-1">
          <input
            type="checkbox"
            checked={enhance}
            onChange={(e) => setEnhance(e.target.checked)}
            className="accent-emerald-500"
          />
          Enhance
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-400 pb-1">
          <input
            type="checkbox"
            checked={nologo}
            onChange={(e) => setNologo(e.target.checked)}
            className="accent-emerald-500"
          />
          No Logo
        </label>
      </div>

      <Field label="Prompt">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="input-field"
          placeholder="A futuristic city at sunset..."
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate();
          }}
        />
      </Field>

      <ActionButton onClick={generate} loading={loading} label="Generate" />

      {imageUrl && (
        <div className="result-card flex flex-col items-center gap-3">
          {isVideo ? (
            <video
              src={imageUrl}
              controls
              autoPlay
              loop
              className="max-w-full rounded-lg"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={prompt}
              className="max-w-full rounded-lg"
              onLoad={() => setLoading(false)}
              onError={() => setLoading(false)}
            />
          )}
          <a
            href={imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-emerald-400 hover:underline break-all"
          >
            Open in new tab
          </a>
        </div>
      )}
    </div>
  );
}

/* ─── Speech Generation ────────────────────────────────────────────── */

function SpeechPanel() {
  const [voice, setVoice] = useState('alloy');
  const [text, setText] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const generate = useCallback(async () => {
    if (!text.trim()) return;
    setLoading(true);
    setAudioUrl('');

    const url = `https://text.pollinations.ai/openai/audio/speech`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: text,
          voice,
          model: 'openai',
          response_format: 'mp3',
        }),
      });

      if (!res.ok) {
        setLoading(false);
        return;
      }

      const blob = await res.blob();
      setAudioUrl(URL.createObjectURL(blob));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [text, voice]);

  return (
    <div className="max-w-4xl mx-auto grid gap-4">
      <Field label="Voice">
        <Select value={voice} onChange={setVoice} options={VOICES} />
      </Field>

      <Field label="Text">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="input-field"
          placeholder="Hello! Welcome to Pollinations AI playground."
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate();
          }}
        />
      </Field>

      <ActionButton onClick={generate} loading={loading} label="Generate" />

      {audioUrl && (
        <div className="result-card flex flex-col items-center gap-3">
          <audio src={audioUrl} controls autoPlay className="w-full" />
          <a
            href={audioUrl}
            download="speech.mp3"
            className="text-xs text-emerald-400 hover:underline"
          >
            Download MP3
          </a>
        </div>
      )}
    </div>
  );
}

/* ─── Shared UI Components ─────────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
        {label}
      </label>
      {children}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 min-w-[160px]"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function ActionButton({
  onClick,
  loading,
  label,
}: {
  onClick: () => void;
  loading: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:text-emerald-400 text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm w-fit"
    >
      {loading ? 'Generating...' : label}
    </button>
  );
}
