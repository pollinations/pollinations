import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PollinationsJob } from "./jobs.js";
import type { JobInfo } from "./types.js";
import { PollinationsError } from "./types.js";

// Build a minimal Response-like object good enough for the job paths.
function makeResponse(
    body: unknown,
    init: {
        ok?: boolean;
        status?: number;
        contentType?: string;
        kind?: "json" | "binary";
        headers?: Record<string, string>;
    } = {},
): Response {
    const {
        ok,
        status = 200,
        contentType = "application/json",
        kind = "json",
        headers = {},
    } = init;

    const headerMap = new Map<string, string>(
        Object.entries({ "content-type": contentType, ...headers }).map(
            ([k, v]) => [k.toLowerCase(), v],
        ),
    );

    const resp: Record<string, unknown> = {
        ok: ok ?? (status >= 200 && status < 300),
        status,
        headers: {
            get: (name: string) => headerMap.get(name.toLowerCase()) ?? null,
        },
        json: async () => body,
        text: async () =>
            typeof body === "string" ? body : JSON.stringify(body),
        arrayBuffer: async () => new ArrayBuffer(8),
    };

    if (kind === "binary") {
        resp.body = null;
    }

    return resp as unknown as Response;
}

function jobInfo(overrides: Partial<JobInfo> = {}): JobInfo {
    return {
        id: "job_1",
        status: "pending",
        status_url: "/v1/jobs/job_1",
        location: "/v1/jobs/job_1/result",
        ...overrides,
    };
}

function submitResponse(overrides: Partial<JobInfo> = {}): Response {
    return makeResponse(jobInfo(overrides), { status: 202 });
}

const nativeFetch = globalThis.fetch;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe("PollinationsJob.submitImage", () => {
    it("sends Prefer: respond-async and returns a job handle", async () => {
        fetchMock.mockResolvedValue(submitResponse());

        const job = await PollinationsJob.submitImage("a cat", {
            apiKey: "k",
            baseUrl: "https://example.test",
        });

        expect(job).toBeInstanceOf(PollinationsJob);
        expect(job.id).toBe("job_1");
        expect(job.statusUrl).toBe("https://example.test/v1/jobs/job_1");
        expect(job.resultUrl).toBe("https://example.test/v1/jobs/job_1/result");

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toContain("https://example.test/image/a%20cat");
        expect(url).toContain("key=k");
        expect(init.headers.Prefer).toBe("respond-async");
        expect(init.headers.Authorization).toBe("Bearer k");
    });

    it("forwards generation options as query params", async () => {
        fetchMock.mockResolvedValue(submitResponse());

        await PollinationsJob.submitImage("a cat", {
            apiKey: "k",
            model: "flux",
            seed: 42,
            width: 512,
            height: 512,
        });

        const [url] = fetchMock.mock.calls[0];
        expect(url).toContain("model=flux");
        expect(url).toContain("seed=42");
        expect(url).toContain("width=512");
        expect(url).toContain("height=512");
    });

    it("requires a prompt", async () => {
        await expect(
            PollinationsJob.submitImage("", { apiKey: "k" }),
        ).rejects.toMatchObject({ code: "INVALID_INPUT", status: 400 });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("maps submit errors to PollinationsError", async () => {
        fetchMock.mockResolvedValue(
            makeResponse(
                { error: { message: "nope", code: "BAD_REQUEST" } },
                { status: 400 },
            ),
        );

        await expect(
            PollinationsJob.submitImage("a cat", { apiKey: "k" }),
        ).rejects.toMatchObject({ code: "BAD_REQUEST", status: 400 });
    });
});

describe("PollinationsJob.submitVideo / submitAudio / submitUrl", () => {
    it("submits a video job", async () => {
        fetchMock.mockResolvedValue(submitResponse());

        const job = await PollinationsJob.submitVideo("a cat running", {
            apiKey: "k",
            model: "veo",
            duration: 4,
        });

        expect(job.id).toBe("job_1");
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toContain("/video/a%20cat%20running");
        expect(url).toContain("model=veo");
        expect(url).toContain("duration=4");
        expect(init.headers.Prefer).toBe("respond-async");
    });

    it("submits an audio job", async () => {
        fetchMock.mockResolvedValue(submitResponse());

        const job = await PollinationsJob.submitAudio("hello", {
            apiKey: "k",
            voice: "nova",
        });

        expect(job.id).toBe("job_1");
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toContain("/audio/hello");
        expect(url).toContain("voice=nova");
        expect(init.headers.Prefer).toBe("respond-async");
    });

    it("submits any media URL, e.g. 3d generation", async () => {
        fetchMock.mockResolvedValue(
            submitResponse({
                id: "job_3d",
                status_url: "/v1/jobs/job_3d",
                location: "/v1/jobs/job_3d/result",
            }),
        );

        const job = await PollinationsJob.submitUrl(
            "https://example.test/3d/a%20cube?key=k",
            { apiKey: "k" },
        );

        expect(job.id).toBe("job_3d");
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("https://example.test/3d/a%20cube?key=k");
        expect(init.headers.Prefer).toBe("respond-async");
    });
});

describe("PollinationsJob.status", () => {
    it("polls status with auth and resolves relative URLs", async () => {
        fetchMock
            .mockResolvedValueOnce(submitResponse())
            .mockResolvedValueOnce(
                makeResponse({
                    status: "succeeded",
                    result_url: "/v1/jobs/job_1/result",
                }),
            );

        const job = await PollinationsJob.submitImage("a cat", {
            apiKey: "k",
            baseUrl: "https://example.test",
        });
        const status = await job.status();

        expect(status.status).toBe("succeeded");
        const [url, init] = fetchMock.mock.calls[1];
        expect(url).toBe("https://example.test/v1/jobs/job_1?key=k");
        expect(init.headers.Authorization).toBe("Bearer k");
    });

    it("uses absolute status URLs as-is", async () => {
        fetchMock
            .mockResolvedValueOnce(
                submitResponse({
                    status_url: "https://jobs.example.test/v1/jobs/job_1",
                    location: "https://jobs.example.test/v1/jobs/job_1/result",
                }),
            )
            .mockResolvedValueOnce(makeResponse({ status: "pending" }));

        const job = await PollinationsJob.submitImage("a cat", {
            apiKey: "k",
            baseUrl: "https://example.test",
        });
        await job.status();

        const [url] = fetchMock.mock.calls[1];
        expect(url).toBe("https://jobs.example.test/v1/jobs/job_1?key=k");
    });

    it("maps status errors to PollinationsError", async () => {
        fetchMock
            .mockResolvedValueOnce(submitResponse())
            .mockResolvedValueOnce(
                makeResponse(
                    { error: { message: "forbidden", code: "PERMISSION_DENIED" } },
                    { status: 403 },
                ),
            );

        const job = await PollinationsJob.submitImage("a cat", {
            apiKey: "k",
        });
        await expect(job.status()).rejects.toMatchObject({
            code: "PERMISSION_DENIED",
            status: 403,
        });
    });
});

describe("PollinationsJob.result", () => {
    it("returns the result bytes once succeeded", async () => {
        fetchMock
            .mockResolvedValueOnce(submitResponse())
            .mockResolvedValueOnce(
                makeResponse(null, {
                    kind: "binary",
                    contentType: "image/png",
                }),
            );

        const job = await PollinationsJob.submitImage("a cat", {
            apiKey: "k",
            baseUrl: "https://example.test",
        });
        const { buffer, contentType } = await job.result();

        expect(contentType).toBe("image/png");
        expect(buffer).toBeInstanceOf(ArrayBuffer);
        const [url] = fetchMock.mock.calls[1];
        expect(url).toBe("https://example.test/v1/jobs/job_1/result?key=k");
    });

    it("follows the freshest result_url from status", async () => {
        fetchMock
            .mockResolvedValueOnce(submitResponse())
            .mockResolvedValueOnce(
                makeResponse({
                    status: "succeeded",
                    result_url: "https://files.example.test/out.mp4",
                }),
            )
            .mockResolvedValueOnce(
                makeResponse(null, {
                    kind: "binary",
                    contentType: "video/mp4",
                }),
            );

        const job = await PollinationsJob.submitVideo("a cat running", {
            apiKey: "k",
        });
        await job.status();
        const { contentType } = await job.result();

        expect(contentType).toBe("video/mp4");
        const [url] = fetchMock.mock.calls[2];
        expect(url).toBe("https://files.example.test/out.mp4?key=k");
    });

    it("throws JOB_PENDING when the result is not ready", async () => {
        fetchMock
            .mockResolvedValueOnce(submitResponse())
            .mockResolvedValueOnce(
                makeResponse({ error: "pending" }, { status: 409 }),
            );

        const job = await PollinationsJob.submitImage("a cat", {
            apiKey: "k",
        });
        await expect(job.result()).rejects.toMatchObject({
            code: "JOB_PENDING",
            status: 409,
        });
    });
});

describe("PollinationsJob.poll", () => {
    it("polls until the job succeeds", async () => {
        fetchMock
            .mockResolvedValueOnce(submitResponse())
            .mockResolvedValueOnce(makeResponse({ status: "pending" }))
            .mockResolvedValueOnce(
                makeResponse({
                    status: "succeeded",
                    result_url: "/v1/jobs/job_1/result",
                }),
            );

        const job = await PollinationsJob.submitImage("a cat", {
            apiKey: "k",
        });
        const status = await job.poll({ interval: 1 });

        expect(status.status).toBe("succeeded");
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("times out while the job stays pending", async () => {
        fetchMock
            .mockResolvedValueOnce(submitResponse())
            .mockResolvedValue(makeResponse({ status: "pending" }));

        const job = await PollinationsJob.submitImage("a cat", {
            apiKey: "k",
        });
        await expect(
            job.poll({ interval: 1, timeout: 5 }),
        ).rejects.toMatchObject({ code: "TIMEOUT", status: 408 });
    });

    it("cancels polling via AbortSignal", async () => {
        fetchMock
            .mockResolvedValueOnce(submitResponse())
            .mockResolvedValue(makeResponse({ status: "pending" }));

        const job = await PollinationsJob.submitImage("a cat", {
            apiKey: "k",
        });
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 5);

        await expect(
            job.poll({ interval: 1, signal: controller.signal }),
        ).rejects.toMatchObject({ code: "CANCELLED", status: 499 });
    });
});

describe("PollinationsJob.waitForResult", () => {
    it("waits for completion then returns the file", async () => {
        fetchMock
            .mockResolvedValueOnce(submitResponse())
            .mockResolvedValueOnce(makeResponse({ status: "pending" }))
            .mockResolvedValueOnce(
                makeResponse({
                    status: "succeeded",
                    result_url: "https://files.example.test/out.mp4",
                }),
            )
            .mockResolvedValueOnce(
                makeResponse(null, {
                    kind: "binary",
                    contentType: "video/mp4",
                }),
            );

        const job = await PollinationsJob.submitVideo("a cat running", {
            apiKey: "k",
        });
        const { buffer, contentType } = await job.waitForResult({
            interval: 1,
        });

        expect(contentType).toBe("video/mp4");
        expect(buffer).toBeInstanceOf(ArrayBuffer);
        expect(fetchMock).toHaveBeenCalledTimes(4);
        const [resultUrl] = fetchMock.mock.calls[3];
        expect(resultUrl).toBe("https://files.example.test/out.mp4?key=k");
    });

    it("throws JOB_FAILED when the job fails", async () => {
        fetchMock
            .mockResolvedValueOnce(submitResponse())
            .mockResolvedValueOnce(
                makeResponse({
                    status: "failed",
                    error: { message: "model exploded", code: "MODEL_ERROR" },
                }),
            );

        const job = await PollinationsJob.submitImage("a cat", {
            apiKey: "k",
        });
        const error = (await job
            .waitForResult()
            .catch((err: unknown) => err)) as PollinationsError;

        expect(error).toBeInstanceOf(PollinationsError);
        expect(error.code).toBe("JOB_FAILED");
        expect(error.message).toContain("model exploded");
    });
});
