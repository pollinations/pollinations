# Pollinations Playground

An interactive web playground for exploring the full range of Pollinations AI capabilities — text, image, video, speech, and more — all in one place.

**[playground.pollinations.ai](https://playground.pollinations.ai)**

## What is it?

Pollinations Playground is a hands-on environment where you can experiment with generative AI without writing any code. Pick a model, tweak the settings, and see results instantly. It's designed for creators, developers, and anyone curious about what AI can do.

### Text

- **Text Generation** — Generate text from a prompt with any supported language model.
- **Streaming** — Watch responses appear in real time as the model writes.
- **Structured Outputs** — Get results in structured JSON using a schema you define.
- **Tool Calling** — Let the model call functions and return structured results.

### Image & Video

- **Image Generation** — Create images from text prompts with models like Flux, Turbo, and more.
- **Video Generation** — Generate short videos from descriptions.
- **Media Upload** — Upload images, audio, or video and get a shareable URL.

### Speech & Audio

- **Speech Generation** — Turn text into natural-sounding speech with selectable voices and formats.
- **Speech Transcription** — Upload an audio file and get a text transcript using Whisper or ElevenLabs Scribe.

### Advanced

- **Chat** — A conversational interface with message history and multi-turn context.
- **Workflow / Orchestration** — Chain multiple AI steps together into a single workflow.
- **Agentic Tool-Calling** — An AI agent that categorizes queries, analyzes sentiment, and routes to the right handler automatically.

## How it works

The playground authenticates through [enter.pollinations.ai](https://enter.pollinations.ai) and communicates directly with the Pollinations API. Models are fetched live from the API and cached locally, so you always see the latest available options. Paid-only models are clearly labeled.

## Built with

- [Next.js](https://nextjs.org) (App Router)
- [Vercel AI SDK](https://sdk.vercel.ai)
- [Tailwind CSS](https://tailwindcss.com)
- [Radix UI](https://www.radix-ui.com) + [shadcn/ui](https://ui.shadcn.com)
- [Pollinations AI SDK Provider](https://github.com/pollinations/pollinations/tree/main/apps/playground)

## Credits

UI inspiration and the original AI SDK provider by [Artsiom Barouski](https://github.com/artsiombarouski). The provider bridges Pollinations models into the Vercel AI SDK ecosystem, enabling a unified interface for text, image, and speech generation.


## License

MIT
