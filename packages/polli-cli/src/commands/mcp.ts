import { Command } from "commander";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { printError, printInfo, printSuccess, getOutputMode } from "../lib/output.js";
import { t } from "../lib/i18n.js";
import { logActivity } from "../lib/logger.js";
import { requireKey } from "../lib/api.js";
import { gen } from "../lib/api.js";
import { BASE_URL } from "../lib/config.js";
import { uploadFile } from "./upload.js";
import { getCachedModels, setCachedModels } from "../lib/cache.js";
import { writeFileSync } from "node:fs";
import { z } from "zod";

// Define tool input schemas using Zod
const GenImageSchema = z.object({
    prompt: z.string().describe("Image description"),
    model: z.string().optional().describe("Image model (default: zimage)"),
    width: z.number().optional().describe("Image width (default: 1024)"),
    height: z.number().optional().describe("Image height (default: 1024)"),
    seed: z.number().optional().describe("Random seed"),
    safe: z.boolean().optional().describe("Enable safety filters"),
    transparent: z.boolean().optional().describe("Transparent background (PNG)"),
    image: z.array(z.string()).optional().describe("Reference image URL(s) for editing/i2i (repeatable)"),
    output: z.string().optional().describe("Save to file (default: image.png)"),
});

const GenTextSchema = z.object({
    prompt: z.string().describe("Text prompt"),
    model: z.string().optional().describe("Text model"),
    system: z.string().optional().describe("System message"),
    temperature: z.number().optional().describe("Randomness (0-2)"),
    maxTokens: z.number().optional().describe("Maximum output tokens"),
    topP: z.number().optional().describe("Nucleus sampling (0-1)"),
    frequencyPenalty: z.number().optional().describe("Repetition penalty (-2 to 2)"),
    presencePenalty: z.number().optional().describe("Topic penalty (-2 to 2)"),
    seed: z.number().optional().describe("Reproducibility seed"),
    jsonResponse: z.boolean().optional().describe("Force model to return JSON object"),
    reasoning: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).optional().describe("Reasoning effort"),
    image: z.array(z.string()).optional().describe("Attach image URL(s) for vision models"),
});

const GenAudioSchema = z.object({
    text: z.string().describe("Text to speak"),
    voice: z.string().optional().describe("Voice name (default: sage)"),
    format: z.enum(["mp3", "opus", "aac", "flac", "wav"]).optional().describe("Audio format (default: mp3)"),
    model: z.string().optional().describe("Audio model"),
    speed: z.number().optional().describe("Playback speed (0.25-4)"),
    duration: z.number().optional().describe("Music duration in seconds (elevenmusic)"),
    instrumental: z.boolean().optional().describe("Instrumental only (elevenmusic)"),
    seed: z.number().optional().describe("Seed for deterministic output"),
    output: z.string().optional().describe("Save to file (default: speech.mp3)"),
});

const GenVideoSchema = z.object({
    prompt: z.string().describe("Video description"),
    model: z.string().optional().describe("Video model (default: wan-fast)"),
    width: z.number().optional().describe("Video width (default: 1024)"),
    height: z.number().optional().describe("Video height (default: 1024)"),
    duration: z.number().optional().describe("Duration in seconds (1-30)"),
    aspectRatio: z.enum(["16:9", "9:16"]).optional().describe("Aspect ratio"),
    audio: z.boolean().optional().describe("Include AI soundtrack"),
    seed: z.number().optional().describe("Random seed"),
    image: z.string().optional().describe("Reference frame URL"),
    output: z.string().optional().describe("Save to file (default: video.mp4)"),
});

const TranscribeSchema = z.object({
    file: z.string().describe("Audio file path"),
    model: z.enum(["whisper", "scribe", "universal-2", "universal-3-pro"]).optional().describe("STT model (default: whisper)"),
    language: z.string().length(2).optional().describe("Language hint (ISO code)"),
});

const ListModelsSchema = z.object({
    type: z.enum(["text", "image", "audio", "video", "embedding", "all"]).optional().describe("Filter by type (default: all)"),
    stats: z.boolean().optional().describe("Show health stats"),
    window: z.number().optional().describe("Stats window in minutes (default: 60)"),
});

const GetUsageSchema = z.object({
    history: z.boolean().optional().describe("Show individual request history"),
    daily: z.boolean().optional().describe("Show daily summary"),
    limit: z.number().optional().describe("Number of records (default: 20)"),
});

const UploadFileSchema = z.object({
    file: z.string().describe("Path to local file to upload"),
});

export const mcpCommand = new Command("mcp")
    .description("Start MCP (Model Context Protocol) server")
    .option("--port <port>", "Port for SSE transport", "3000")
    .option("--stdio", "Use stdio transport instead of SSE")
    .addHelpText("after", `
MCP (Model Context Protocol) allows AI agents to interact with polli
programmatically. The server exposes tools for generation, model listing,
usage, and more.

Examples:
  polli mcp --stdio
  polli mcp --port 8080
    `)
    .action(async (opts) => {
        // Ensure we have a valid key before starting
        let key: string;
        try {
            key = await requireKey();
        } catch {
            printError("MCP server requires authentication. Please run 'polli auth login' first.");
            process.exit(1);
        }

        // Create MCP server
        const server = new Server(
            {
                name: "polli-mcp",
                version: "0.1.0",
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        // List tools handler
        server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: "gen_image",
                        description: "Generate an image from a prompt",
                        inputSchema: {
                            type: "object",
                            properties: {
                                prompt: { type: "string", description: "Image description" },
                                model: { type: "string", description: "Image model (default: zimage)" },
                                width: { type: "number", description: "Image width (default: 1024)" },
                                height: { type: "number", description: "Image height (default: 1024)" },
                                seed: { type: "number", description: "Random seed" },
                                safe: { type: "boolean", description: "Enable safety filters" },
                                transparent: { type: "boolean", description: "Transparent background (PNG)" },
                                image: { type: "array", items: { type: "string" }, description: "Reference image URL(s)" },
                                output: { type: "string", description: "Save to file (default: image.png)" },
                            },
                            required: ["prompt"],
                        },
                    },
                    {
                        name: "gen_text",
                        description: "Generate text from a prompt",
                        inputSchema: {
                            type: "object",
                            properties: {
                                prompt: { type: "string", description: "Text prompt" },
                                model: { type: "string", description: "Text model" },
                                system: { type: "string", description: "System message" },
                                temperature: { type: "number", description: "Randomness (0-2)" },
                                maxTokens: { type: "number", description: "Maximum output tokens" },
                                topP: { type: "number", description: "Nucleus sampling (0-1)" },
                                frequencyPenalty: { type: "number", description: "Repetition penalty (-2 to 2)" },
                                presencePenalty: { type: "number", description: "Topic penalty (-2 to 2)" },
                                seed: { type: "number", description: "Reproducibility seed" },
                                jsonResponse: { type: "boolean", description: "Force model to return JSON object" },
                                reasoning: { type: "string", enum: ["none", "minimal", "low", "medium", "high", "xhigh"], description: "Reasoning effort" },
                                image: { type: "array", items: { type: "string" }, description: "Attach image URL(s) for vision models" },
                            },
                            required: ["prompt"],
                        },
                    },
                    {
                        name: "gen_audio",
                        description: "Generate speech or music from text",
                        inputSchema: {
                            type: "object",
                            properties: {
                                text: { type: "string", description: "Text to speak" },
                                voice: { type: "string", description: "Voice name (default: sage)" },
                                format: { type: "string", enum: ["mp3", "opus", "aac", "flac", "wav"], description: "Audio format (default: mp3)" },
                                model: { type: "string", description: "Audio model" },
                                speed: { type: "number", description: "Playback speed (0.25-4)" },
                                duration: { type: "number", description: "Music duration in seconds (elevenmusic)" },
                                instrumental: { type: "boolean", description: "Instrumental only (elevenmusic)" },
                                seed: { type: "number", description: "Seed for deterministic output" },
                                output: { type: "string", description: "Save to file (default: speech.mp3)" },
                            },
                            required: ["text"],
                        },
                    },
                    {
                        name: "gen_video",
                        description: "Generate a video from a prompt",
                        inputSchema: {
                            type: "object",
                            properties: {
                                prompt: { type: "string", description: "Video description" },
                                model: { type: "string", description: "Video model (default: wan-fast)" },
                                width: { type: "number", description: "Video width (default: 1024)" },
                                height: { type: "number", description: "Video height (default: 1024)" },
                                duration: { type: "number", description: "Duration in seconds (1-30)" },
                                aspectRatio: { type: "string", enum: ["16:9", "9:16"], description: "Aspect ratio" },
                                audio: { type: "boolean", description: "Include AI soundtrack" },
                                seed: { type: "number", description: "Random seed" },
                                image: { type: "string", description: "Reference frame URL" },
                                output: { type: "string", description: "Save to file (default: video.mp4)" },
                            },
                            required: ["prompt"],
                        },
                    },
                    {
                        name: "transcribe",
                        description: "Transcribe audio to text",
                        inputSchema: {
                            type: "object",
                            properties: {
                                file: { type: "string", description: "Audio file path" },
                                model: { type: "string", enum: ["whisper", "scribe", "universal-2", "universal-3-pro"], description: "STT model (default: whisper)" },
                                language: { type: "string", description: "Language hint (ISO code)" },
                            },
                            required: ["file"],
                        },
                    },
                    {
                        name: "list_models",
                        description: "List available models or show health stats",
                        inputSchema: {
                            type: "object",
                            properties: {
                                type: { type: "string", enum: ["text", "image", "audio", "video", "embedding", "all"], description: "Filter by type (default: all)" },
                                stats: { type: "boolean", description: "Show health stats" },
                                window: { type: "number", description: "Stats window in minutes (default: 60)" },
                            },
                        },
                    },
                    {
                        name: "get_usage",
                        description: "Get pollen balance or usage history",
                        inputSchema: {
                            type: "object",
                            properties: {
                                history: { type: "boolean", description: "Show individual request history" },
                                daily: { type: "boolean", description: "Show daily summary" },
                                limit: { type: "number", description: "Number of records (default: 20)" },
                            },
                        },
                    },
                    {
                        name: "upload_file",
                        description: "Upload a local file to media.pollinations.ai",
                        inputSchema: {
                            type: "object",
                            properties: {
                                file: { type: "string", description: "Path to local file to upload" },
                            },
                            required: ["file"],
                        },
                    },
                ],
            };
        });

        // Call tool handler
        server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            try {
                switch (name) {
                    case "gen_image": {
                        const parsed = GenImageSchema.parse(args);
                        const key = await requireKey();
                        const params = new URLSearchParams({
                            model: parsed.model || "zimage",
                            width: String(parsed.width || 1024),
                            height: String(parsed.height || 1024),
                        });
                        if (parsed.seed) params.set("seed", String(parsed.seed));
                        if (parsed.safe) params.set("safe", "true");
                        if (parsed.transparent) params.set("transparent", "true");
                        if (parsed.image?.length) {
                            params.set("image", parsed.image.join("|"));
                        }
                        const url = `${BASE_URL}/image/${encodeURIComponent(parsed.prompt)}?${params}`;
                        const res = await fetch(url, {
                            headers: { Authorization: `Bearer ${key}` },
                        });
                        if (!res.ok) {
                            const text = await res.text();
                            throw new Error(`${res.status}: ${text}`);
                        }
                        const buffer = Buffer.from(await res.arrayBuffer());
                        const outputPath = parsed.output || "image.png";
                        writeFileSync(outputPath, buffer);
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Image saved to ${outputPath} (${buffer.length} bytes)`,
                                },
                            ],
                        };
                    }

                    case "gen_text": {
                        const parsed = GenTextSchema.parse(args);
                        const key = await requireKey();
                        const body: Record<string, unknown> = {
                            messages: [
                                ...(parsed.system ? [{ role: "system", content: parsed.system }] : []),
                                {
                                    role: "user",
                                    content: parsed.image?.length
                                        ? [
                                            { type: "text", text: parsed.prompt },
                                            ...parsed.image.map((url) => ({ type: "image_url", image_url: { url } })),
                                        ]
                                        : parsed.prompt,
                                },
                            ],
                        };
                        if (parsed.model) body.model = parsed.model;
                        if (parsed.temperature !== undefined) body.temperature = parsed.temperature;
                        if (parsed.maxTokens !== undefined) body.max_tokens = parsed.maxTokens;
                        if (parsed.topP !== undefined) body.top_p = parsed.topP;
                        if (parsed.frequencyPenalty !== undefined) body.frequency_penalty = parsed.frequencyPenalty;
                        if (parsed.presencePenalty !== undefined) body.presence_penalty = parsed.presencePenalty;
                        if (parsed.seed !== undefined) body.seed = parsed.seed;
                        if (parsed.jsonResponse) body.response_format = { type: "json_object" };
                        if (parsed.reasoning) body.reasoning_effort = parsed.reasoning;

                        const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${key}`,
                            },
                            body: JSON.stringify(body),
                        });
                        if (!res.ok) {
                            const text = await res.text();
                            throw new Error(`${res.status}: ${text}`);
                        }
                        const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
                        const content = data.choices[0]?.message?.content || "";
                        return {
                            content: [{ type: "text", text: content }],
                        };
                    }

                    case "gen_audio": {
                        const parsed = GenAudioSchema.parse(args);
                        const key = await requireKey();
                        const params = new URLSearchParams({
                            voice: parsed.voice || "sage",
                        });
                        if (parsed.format && parsed.format !== "mp3")
                            params.set("response_format", parsed.format);
                        if (parsed.model) params.set("model", parsed.model);
                        if (parsed.speed) params.set("speed", String(parsed.speed));
                        if (parsed.duration) params.set("duration", String(parsed.duration));
                        if (parsed.instrumental) params.set("instrumental", "true");
                        if (parsed.seed) params.set("seed", String(parsed.seed));
                        const url = `${BASE_URL}/audio/${encodeURIComponent(parsed.text)}?${params}`;
                        const res = await fetch(url, {
                            headers: { Authorization: `Bearer ${key}` },
                        });
                        if (!res.ok) {
                            const text = await res.text();
                            throw new Error(`${res.status}: ${text}`);
                        }
                        const buffer = Buffer.from(await res.arrayBuffer());
                        const outputPath = parsed.output || "speech.mp3";
                        writeFileSync(outputPath, buffer);
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Audio saved to ${outputPath} (${buffer.length} bytes)`,
                                },
                            ],
                        };
                    }

                    case "gen_video": {
                        const parsed = GenVideoSchema.parse(args);
                        const key = await requireKey();
                        const params = new URLSearchParams({
                            width: String(parsed.width || 1024),
                            height: String(parsed.height || 1024),
                        });
                        if (parsed.model) params.set("model", parsed.model);
                        if (parsed.duration) params.set("duration", String(parsed.duration));
                        if (parsed.aspectRatio) params.set("aspectRatio", parsed.aspectRatio);
                        if (parsed.audio) params.set("audio", "true");
                        if (parsed.seed) params.set("seed", String(parsed.seed));
                        if (parsed.image) params.set("image", parsed.image);
                        const url = `${BASE_URL}/video/${encodeURIComponent(parsed.prompt)}?${params}`;
                        const res = await fetch(url, {
                            headers: { Authorization: `Bearer ${key}` },
                        });
                        if (!res.ok) {
                            const text = await res.text();
                            throw new Error(`${res.status}: ${text}`);
                        }
                        const buffer = Buffer.from(await res.arrayBuffer());
                        const outputPath = parsed.output || "video.mp4";
                        writeFileSync(outputPath, buffer);
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Video saved to ${outputPath} (${buffer.length} bytes)`,
                                },
                            ],
                        };
                    }

                    case "transcribe": {
                        const parsed = TranscribeSchema.parse(args);
                        const key = await requireKey();
                        const { readFileSync } = await import("node:fs");
                        const { basename } = await import("node:path");
                        const buffer = readFileSync(parsed.file);
                        const blob = new Blob([buffer]);
                        const formData = new FormData();
                        formData.append("file", blob, basename(parsed.file));
                        formData.append("model", parsed.model || "whisper");
                        if (parsed.language) formData.append("language", parsed.language);
                        const res = await fetch(`${BASE_URL}/v1/audio/transcriptions`, {
                            method: "POST",
                            headers: { Authorization: `Bearer ${key}` },
                            body: formData,
                        });
                        if (!res.ok) {
                            const text = await res.text();
                            throw new Error(`${res.status}: ${text}`);
                        }
                        const data = (await res.json()) as { text: string };
                        return {
                            content: [{ type: "text", text: data.text }],
                        };
                    }

                    case "list_models": {
                        const parsed = ListModelsSchema.parse(args);
                        const key = await requireKey();
                        // Try cache if not stats
                        if (!parsed.stats) {
                            const cached = getCachedModels<unknown>();
                            if (cached) {
                                return {
                                    content: [{ type: "text", text: JSON.stringify(cached, null, 2) }],
                                };
                            }
                        }
                        // Fetch fresh
                        let models = [];
                        const type = parsed.type || "all";
                        if (type === "all" || type === "image" || type === "video") {
                            const imageModels = await gen<unknown[]>("/image/models", { apiKey: key });
                            models = models.concat(imageModels);
                        }
                        if (type === "all" || type === "text") {
                            const textModels = await gen<unknown[]>("/text/models", { apiKey: key });
                            models = models.concat(textModels);
                        }
                        if (type === "all" || type === "audio") {
                            const audioModels = await gen<unknown[]>("/audio/models", { apiKey: key });
                            models = models.concat(audioModels);
                        }
                        if (type === "all" || type === "embedding") {
                            const embeddingModels = await gen<unknown[]>("/embeddings/models", { apiKey: key });
                            models = models.concat(embeddingModels);
                        }
                        // Cache if not stats
                        if (!parsed.stats) {
                            setCachedModels(models);
                        }
                        return {
                            content: [{ type: "text", text: JSON.stringify(models, null, 2) }],
                        };
                    }

                    case "get_usage": {
                        const parsed = GetUsageSchema.parse(args);
                        const key = await requireKey();
                        let endpoint = "/account/balance";
                        if (parsed.history) {
                            const limit = parsed.limit || 20;
                            endpoint = `/account/usage?limit=${limit}`;
                        } else if (parsed.daily) {
                            endpoint = "/account/usage/daily";
                        }
                        const data = await gen<unknown>(endpoint, { apiKey: key });
                        return {
                            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
                        };
                    }

                    case "upload_file": {
                        const parsed = UploadFileSchema.parse(args);
                        const key = await requireKey();
                        const result = await uploadFile(parsed.file, key);
                        return {
                            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                        };
                    }

                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return {
                    content: [{ type: "text", text: `Error: ${message}` }],
                    isError: true,
                };
            }
        });

        // Start transport
        if (opts.stdio) {
            const transport = new StdioServerTransport();
            await server.connect(transport);
            printSuccess(t("mcp.server_started", { transport: "stdio" }));
            logActivity("mcp_start", { transport: "stdio" });
        } else {
            const port = parseInt(opts.port, 10) || 3000;
            // Use SSE transport with HTTP server
            const express = await import("express");
            const app = express.default();
            app.use(express.json());

            let transport: SSEServerTransport | null = null;
            app.get("/sse", async (req, res) => {
                transport = new SSEServerTransport("/messages", res);
                await server.connect(transport);
            });

            app.post("/messages", async (req, res) => {
                if (transport) {
                    await transport.handlePostMessage(req, res);
                } else {
                    res.status(400).send("No transport established");
                }
            });

            app.listen(port, () => {
                printSuccess(t("mcp.server_started", { transport: `http://localhost:${port}/sse` }));
                logActivity("mcp_start", { transport: "sse", port });
            });

            // Keep alive
            await new Promise(() => {});
        }
    });