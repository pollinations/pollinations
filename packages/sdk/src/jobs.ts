import { pollinationsErrorFromResponse } from "./error-response.js";
import type {
    AudioGenerateOptions,
    ImageGenerateOptions,
    JobInfo,
    JobPollOptions,
    JobResultResponse,
    JobStatusInfo,
    JobSubmitOptions,
    RequestOptions,
    SubmitAudioOptions,
    SubmitImageOptions,
    SubmitVideoOptions,
    VideoGenerateOptions,
} from "./types.js";
import { PollinationsError } from "./types.js";

const DEFAULT_BASE_URL = "https://gen.pollinations.ai";
const DEFAULT_TIMEOUT = 300_000; // 5min for submit/status/result requests
const DEFAULT_POLL_INTERVAL = 2_000; // 2s between status checks
const DEFAULT_POLL_TIMEOUT = 1_200_000; // 20min max wait (video generation can take minutes)
const PREFER_ASYNC = "respond-async";

// Helper to get env var (works in Node.js, Deno, Bun, and edge runtimes)
function getEnvVar(name: string): string | undefined {
    try {
        const g = globalThis as Record<string, unknown>;
        if (g.process && typeof g.process === "object") {
            const proc = g.process as {
                env?: Record<string, string | undefined>;
            };
            if (proc.env) return proc.env[name];
        }
        if (g.Deno && typeof g.Deno === "object") {
            const deno = g.Deno as {
                env?: { get?: (k: string) => string | undefined };
            };
            if (deno.env?.get) return deno.env.get(name);
        }
    } catch {
        return undefined;
    }
    return undefined;
}

// Sleep helper for job polling (mirrors client.ts)
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fetch with timeout using AbortController — mirrors client.ts so job
// requests behave identically to the synchronous media endpoints.
async function fetchWithTimeout<T>(
    url: string,
    options: RequestInit,
    timeoutMs: number,
    externalSignal: AbortSignal | undefined,
    consume: (response: Response) => Promise<T>,
): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // If an external signal is provided, abort our controller when it aborts
    const abortHandler = externalSignal ? () => controller.abort() : undefined;
    if (externalSignal && abortHandler) {
        externalSignal.addEventListener("abort", abortHandler);
    }

    try {
        externalSignal?.throwIfAborted();
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        return await consume(response);
    } catch (err) {
        // Check if it was cancelled by external signal
        if (externalSignal?.aborted) {
            throw new PollinationsError(
                "Request was cancelled",
                "CANCELLED",
                499, // Client Closed Request
            );
        }
        if (controller.signal.aborted) {
            throw new PollinationsError(
                `Request timed out after ${timeoutMs}ms`,
                "TIMEOUT",
                408,
            );
        }
        throw err;
    } finally {
        clearTimeout(timeoutId);
        if (externalSignal && abortHandler) {
            externalSignal.removeEventListener("abort", abortHandler);
        }
    }
}

// Build query params for job submit URLs (same encoding as the client)
function buildQueryParams(
    params: Record<string, unknown>,
    apiKey?: string,
): string {
    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue;

        if (Array.isArray(value)) {
            const separator = [
                "image",
                "reference_images",
                "reference_videos",
                "reference_audios",
            ].includes(key)
                ? "|"
                : ",";
            searchParams.set(key, value.join(separator));
        } else if (typeof value === "boolean") {
            searchParams.set(key, value ? "true" : "false");
        } else {
            searchParams.set(key, String(value));
        }
    }

    if (apiKey) {
        searchParams.set("key", apiKey);
    }

    return searchParams.toString();
}

// Build the submit URL for an image job — mirrors client.image()
function buildImageUrl(
    baseUrl: string,
    prompt: string,
    options: ImageGenerateOptions,
    apiKey?: string,
): string {
    const params: Record<string, unknown> = {
        model: options.model,
        width: options.width,
        height: options.height,
        resolution: options.resolution,
        seed: options.seed,
        safe: options.safe,
        quality: options.quality,
        image: options.referenceImage,
        transparent: options.transparent,
        guidance_scale: options.guidanceScale,
        reasoning: options.reasoning,
    };

    const queryString = buildQueryParams(params, apiKey);
    const encodedPrompt = encodeURIComponent(prompt);

    return `${baseUrl}/image/${encodedPrompt}${queryString ? `?${queryString}` : ""}`;
}

// Build the submit URL for a video job — mirrors client.video()
function buildVideoUrl(
    baseUrl: string,
    prompt: string,
    options: VideoGenerateOptions,
    apiKey?: string,
): string {
    const params: Record<string, unknown> = {
        model: options.model,
        duration: options.duration,
        aspectRatio: options.aspectRatio,
        resolution: options.resolution,
        seed: options.seed,
        audio: options.audio,
        image: options.referenceImage,
        reference_images: options.referenceImages,
        reference_videos: options.referenceVideos,
        reference_audios: options.referenceAudios,
        safe: options.safe,
    };

    const queryString = buildQueryParams(params, apiKey);
    const encodedPrompt = encodeURIComponent(prompt);

    return `${baseUrl}/video/${encodedPrompt}${queryString ? `?${queryString}` : ""}`;
}

// Build the submit URL for an audio job — mirrors client.audio()
function buildAudioUrl(
    baseUrl: string,
    text: string,
    options: AudioGenerateOptions,
    apiKey?: string,
): string {
    const params: Record<string, unknown> = {
        voice: options.voice,
        model: options.model,
        duration: options.duration,
        seed: options.seed,
    };

    const queryString = buildQueryParams(params, apiKey);
    const encodedText = encodeURIComponent(text);

    return `${baseUrl}/audio/${encodedText}${queryString ? `?${queryString}` : ""}`;
}

// Resolve a (possibly relative) job URL against the API base URL
function resolveJobUrl(baseUrl: string, url: string): string {
    if (/^https?:\/\//i.test(url)) return url;
    return `${baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
}

// Render a job failure reason as a human-readable message
function jobErrorMessage(error: JobStatusInfo["error"]): string {
    if (!error) return "unknown error";
    if (typeof error === "string") return error;
    return error.message || error.code || JSON.stringify(error);
}

/**
 * Async Job handle
 *
 * Submit media generation requests (image, video, audio, 3d) as background
 * jobs via the `Prefer: respond-async` header, poll their status, and
 * retrieve the resulting file once the job succeeds.
 *
 * @example
 * ```ts
 * const job = await PollinationsJob.submitImage('A cute robot', { apiKey: *** });
 * const { buffer, contentType } = await job.waitForResult({ interval: 1000 });
 * ```
 *
 * @example
 * ```ts
 * // Any media endpoint works, e.g. 3d generation
 * const job = await PollinationsJob.submitUrl('https://gen.pollinations.ai/3d/a%20cube?key=...');
 * const status = await job.poll({ interval: 2000, timeout: 600_000 });
 * ```
 */
export class PollinationsJob {
    /** Unique job identifier */
    readonly id: string;
    /** Absolute URL used to poll job status */
    readonly statusUrl: string;
    /** URL where the result is (or will be) available; refreshed from status */
    resultUrl: string;

    private readonly apiKey?: string;
    private readonly baseUrl: string;
    private readonly timeout: number;

    private constructor(info: JobInfo, config: JobSubmitOptions) {
        const baseUrl = config.baseUrl?.replace(/\/$/, "") || DEFAULT_BASE_URL;
        this.id = info.id;
        this.statusUrl = resolveJobUrl(baseUrl, info.status_url);
        this.resultUrl = resolveJobUrl(baseUrl, info.location);
        this.apiKey = config.apiKey ?? getEnvVar("POLLINATIONS_API_KEY");
        this.baseUrl = baseUrl;
        this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    }

    // ============================================================================
    // Submitting jobs
    // ============================================================================

    /**
     * Submit an image generation request as a background job.
     * Sends `Prefer: respond-async` and returns once the server acknowledges
     * the job with HTTP 202 — the generation itself runs asynchronously.
     *
     * @example
     * ```ts
     * const job = await PollinationsJob.submitImage('A cute robot', {
     *   apiKey: ***,
     *   model: 'flux',
     *   seed: 42,
     * });
     * ```
     */
    static async submitImage(
        prompt: string,
        options: SubmitImageOptions = {},
    ): Promise<PollinationsJob> {
        if (!prompt || typeof prompt !== "string") {
            throw new PollinationsError(
                "Prompt is required and must be a string",
                "INVALID_INPUT",
                400,
            );
        }

        const baseUrl = options.baseUrl?.replace(/\/$/, "") || DEFAULT_BASE_URL;
        const apiKey = options.apiKey ?? getEnvVar("POLLINATIONS_API_KEY");
        const url = buildImageUrl(baseUrl, prompt, options, apiKey);
        return PollinationsJob.submit(url, options, {
            apiKey,
            baseUrl,
            timeout: options.timeout ?? DEFAULT_TIMEOUT,
        });
    }

    /**
     * Submit a video generation request as a background job.
     * Same options as video generation; returns immediately with a job handle.
     *
     * @example
     * ```ts
     * const job = await PollinationsJob.submitVideo('A cat playing piano', {
     *   apiKey: ***,
     *   model: 'veo',
     *   duration: 4,
     * });
     * ```
     */
    static async submitVideo(
        prompt: string,
        options: SubmitVideoOptions = {},
    ): Promise<PollinationsJob> {
        if (!prompt || typeof prompt !== "string") {
            throw new PollinationsError(
                "Prompt is required and must be a string",
                "INVALID_INPUT",
                400,
            );
        }

        const baseUrl = options.baseUrl?.replace(/\/$/, "") || DEFAULT_BASE_URL;
        const apiKey = options.apiKey ?? getEnvVar("POLLINATIONS_API_KEY");
        const url = buildVideoUrl(baseUrl, prompt, options, apiKey);
        return PollinationsJob.submit(url, options, {
            apiKey,
            baseUrl,
            timeout: options.timeout ?? DEFAULT_TIMEOUT,
        });
    }

    /**
     * Submit an audio generation request as a background job.
     * Same options as audio generation; returns immediately with a job handle.
     *
     * @example
     * ```ts
     * const job = await PollinationsJob.submitAudio('Hello, world', {
     *   apiKey: ***,
     *   voice: 'nova',
     * });
     * ```
     */
    static async submitAudio(
        text: string,
        options: SubmitAudioOptions = {},
    ): Promise<PollinationsJob> {
        if (!text || typeof text !== "string") {
            throw new PollinationsError(
                "Text is required and must be a string",
                "INVALID_INPUT",
                400,
            );
        }

        const baseUrl = options.baseUrl?.replace(/\/$/, "") || DEFAULT_BASE_URL;
        const apiKey = options.apiKey ?? getEnvVar("POLLINATIONS_API_KEY");
        const url = buildAudioUrl(baseUrl, text, options, apiKey);
        return PollinationsJob.submit(url, options, {
            apiKey,
            baseUrl,
            timeout: options.timeout ?? DEFAULT_TIMEOUT,
        });
    }

    /**
     * Submit any media URL as a background job (image, video, audio, 3d, …).
     * The URL is sent as-is with the `Prefer: respond-async` header, so any
     * endpoint that supports async responses — including 3d generation — can
     * be used without dedicated SDK support.
     *
     * @example
     * ```ts
     * const job = await PollinationsJob.submitUrl(
     *   'https://gen.pollinations.ai/3d/a%20cube?key=...',
     * );
     * ```
     */
    static async submitUrl(
        url: string,
        options: JobSubmitOptions = {},
    ): Promise<PollinationsJob> {
        const baseUrl = options.baseUrl?.replace(/\/$/, "") || DEFAULT_BASE_URL;
        const apiKey = options.apiKey ?? getEnvVar("POLLINATIONS_API_KEY");
        return PollinationsJob.submit(url, options, {
            apiKey,
            baseUrl,
            timeout: options.timeout ?? DEFAULT_TIMEOUT,
        });
    }

    /** Shared submit implementation: GET the URL with `Prefer: respond-async` */
    private static async submit(
        url: string,
        options: JobSubmitOptions,
        resolved: { apiKey?: string; baseUrl: string; timeout: number },
    ): Promise<PollinationsJob> {
        const info = await fetchWithTimeout<JobInfo>(
            url,
            {
                headers: {
                    ...(resolved.apiKey
                        ? { Authorization: `Bearer ${resolved.apiKey}` }
                        : {}),
                    Prefer: PREFER_ASYNC,
                },
            },
            resolved.timeout,
            options.signal,
            async (response) => {
                if (!response.ok) {
                    throw await pollinationsErrorFromResponse(response);
                }
                return (await response.json()) as JobInfo;
            },
        );

        return new PollinationsJob(info, {
            ...options,
            apiKey: resolved.apiKey,
            baseUrl: resolved.baseUrl,
            timeout: resolved.timeout,
        });
    }

    // ============================================================================
    // Job lifecycle
    // ============================================================================

    private getHeaders(): Record<string, string> {
        return this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {};
    }

    /** Append the API key to a job URL (same convention as the media endpoints) */
    private withKey(url: string): string {
        if (!this.apiKey) return url;
        const separator = url.includes("?") ? "&" : "?";
        return `${url}${separator}key=${encodeURIComponent(this.apiKey)}`;
    }

    /**
     * Fetch the current job status (GET /v1/jobs/:id).
     * Returns `pending`, `succeeded` (with `result_url`), or `failed` (with `error`).
     */
    async status(signal?: AbortSignal): Promise<JobStatusInfo> {
        const info = await fetchWithTimeout<JobStatusInfo>(
            this.withKey(this.statusUrl),
            { headers: this.getHeaders() },
            this.timeout,
            signal,
            async (response) => {
                if (!response.ok) {
                    throw await pollinationsErrorFromResponse(response);
                }
                return (await response.json()) as JobStatusInfo;
            },
        );

        // Track the freshest result URL so result() follows the server
        if (info.result_url) {
            this.resultUrl = resolveJobUrl(this.baseUrl, info.result_url);
        }
        return info;
    }

    /**
     * Retrieve the job result (GET /v1/jobs/:id/result) as raw file bytes.
     * Throws a `PollinationsError` with code `JOB_PENDING` (HTTP 409) while
     * the job is still running — use `poll()` or `waitForResult()` instead.
     */
    async result(options: RequestOptions = {}): Promise<JobResultResponse> {
        return fetchWithTimeout<JobResultResponse>(
            this.withKey(this.resultUrl),
            { headers: this.getHeaders() },
            this.timeout,
            options.signal,
            async (response) => {
                if (response.status === 409) {
                    throw new PollinationsError(
                        `Job ${this.id} is still pending`,
                        "JOB_PENDING",
                        409,
                    );
                }
                if (!response.ok) {
                    throw await pollinationsErrorFromResponse(response);
                }

                const buffer = await response.arrayBuffer();
                const contentType =
                    response.headers.get("content-type") ||
                    "application/octet-stream";

                return { buffer, contentType };
            },
        );
    }

    /**
     * Poll the job status until it reaches a terminal state
     * (`succeeded` or `failed`), checking every `interval` ms and giving up
     * after `timeout` ms. Cancellable via `AbortSignal`.
     *
     * @example
     * ```ts
     * const status = await job.poll({ interval: 1000, timeout: 600_000 });
     * if (status.status === 'succeeded') console.log(status.result_url);
     * ```
     */
    async poll(options: JobPollOptions = {}): Promise<JobStatusInfo> {
        const interval = Math.max(options.interval ?? DEFAULT_POLL_INTERVAL, 0);
        const timeoutMs = options.timeout ?? DEFAULT_POLL_TIMEOUT;
        const controller = new AbortController();
        const onAbort = () => controller.abort();
        options.signal?.addEventListener("abort", onAbort);
        const deadline = Date.now() + timeoutMs;

        try {
            for (;;) {
                options.signal?.throwIfAborted();
                const status = await this.status(controller.signal);
                if (status.status !== "pending") return status;
                if (Date.now() + interval >= deadline) {
                    throw new PollinationsError(
                        `Job ${this.id} did not finish within ${timeoutMs}ms`,
                        "TIMEOUT",
                        408,
                    );
                }
                await sleep(interval);
            }
        } catch (error) {
            if (options.signal?.aborted) {
                throw new PollinationsError(
                    "Job polling was cancelled",
                    "CANCELLED",
                    499,
                );
            }
            throw error;
        } finally {
            options.signal?.removeEventListener("abort", onAbort);
        }
    }

    /**
     * Poll until the job succeeds and return the result file.
     * Throws `PollinationsError` code `TIMEOUT` (408) when the job does not
     * finish in time, or `JOB_FAILED` (500) when the job itself failed.
     *
     * @example
     * ```ts
     * const { buffer, contentType } = await job.waitForResult({ interval: 1000 });
     * ```
     */
    async waitForResult(
        options: JobPollOptions = {},
    ): Promise<JobResultResponse> {
        const status = await this.poll(options);
        if (status.status === "failed") {
            throw new PollinationsError(
                `Job ${this.id} failed: ${jobErrorMessage(status.error)}`,
                "JOB_FAILED",
                500,
            );
        }
        return this.result(options);
    }
}
