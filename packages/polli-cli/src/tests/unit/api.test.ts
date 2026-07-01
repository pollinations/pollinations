import { describe, it, expect, beforeEach, vi } from "vitest";
import { z } from "zod";

// Mocks
const mockConfig = {
    BASE_URL: "https://gen.pollinations.ai",
    resolveApiKey: vi.fn(),
};
const mockOutput = { printError: vi.fn() };
const mockRetry = { withRetry: vi.fn() };
const mockValidation = { validate: vi.fn() };
const mockLogger = { logActivity: vi.fn() };

vi.mock("../../lib/config.js", () => mockConfig);
vi.mock("../../lib/output.js", () => mockOutput);
vi.mock("../../lib/retry.js", () => mockRetry);
vi.mock("../../lib/validation.js", () => mockValidation);
vi.mock("../../lib/logger.js", () => mockLogger);

async function getApi() {
    return await import("../../lib/api.js");
}

describe("api", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("ApiError", () => {
        it("should create an error with status and message", async () => {
            const { ApiError } = await getApi();
            const err = new ApiError(404, "Not Found");
            expect(err).toBeInstanceOf(Error);
            expect(err.status).toBe(404);
            expect(err.message).toBe("Not Found");
            expect(err.name).toBe("ApiError");
        });
    });

    describe("requireKey", () => {
        it("should return the API key when available", async () => {
            const { requireKey } = await getApi();
            mockConfig.resolveApiKey.mockReturnValue("sk_test_key");
            const key = requireKey();
            expect(key).toBe("sk_test_key");
        });

        it("should exit when no key is available", async () => {
            const { requireKey } = await getApi();
            mockConfig.resolveApiKey.mockReturnValue(undefined);
            const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
            requireKey();
            expect(mockOutput.printError).toHaveBeenCalledWith(
                "Not logged in. Run: polli auth login",
            );
            expect(exitSpy).toHaveBeenCalledWith(1);
            exitSpy.mockRestore();
        });
    });

    describe("gen", () => {
        it("should make a GET request and return data", async () => {
            const { gen } = await getApi();
            const mockData = { id: "flux", name: "Flux" };
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockData),
            });
            mockConfig.resolveApiKey.mockReturnValue("sk_key");
            mockRetry.withRetry.mockImplementation((fn: () => unknown) => fn());

            const result = await gen("/v1/models");

            expect(result).toEqual(mockData);
        });

        it("should make a POST request with body", async () => {
            const { gen } = await getApi();
            const body = { prompt: "test" };
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ result: "ok" }),
            });
            mockConfig.resolveApiKey.mockReturnValue("sk_key");
            mockRetry.withRetry.mockImplementation((fn: () => unknown) => fn());

            await gen("/v1/chat/completions", { method: "POST", body });

            expect(globalThis.fetch).toHaveBeenCalledWith(
                "https://gen.pollinations.ai/v1/chat/completions",
                expect.objectContaining({
                    method: "POST",
                    body: JSON.stringify(body),
                }),
            );
        });

        it("should throw ApiError on non-ok response", async () => {
            const { gen } = await getApi();
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 429,
                statusText: "Too Many Requests",
                text: () => Promise.resolve("Rate limited"),
            });
            mockConfig.resolveApiKey.mockReturnValue("sk_key");
            mockRetry.withRetry.mockImplementation((fn: () => unknown) => fn());

            await expect(gen("/v1/models")).rejects.toThrow("429 Too Many Requests: Rate limited");
            expect(mockLogger.logActivity).toHaveBeenCalledWith(
                "api_error",
                expect.objectContaining({ path: "/v1/models", status: 429 }),
            );
        });

        it("should not use retry when retry: false", async () => {
            const { gen } = await getApi();
            const mockData = { id: "test" };
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockData),
            });
            mockConfig.resolveApiKey.mockReturnValue("sk_key");

            const result = await gen("/test", { retry: false });

            expect(result).toEqual(mockData);
            expect(mockRetry.withRetry).not.toHaveBeenCalled();
        });

        it("should handle fetch errors gracefully", async () => {
            const { gen } = await getApi();
            globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
            mockConfig.resolveApiKey.mockReturnValue("sk_key");
            mockRetry.withRetry.mockImplementation((fn: () => Promise<unknown>) => fn());

            await expect(gen("/v1/models")).rejects.toThrow("ECONNRESET");
        });

        it("should use provided API key", async () => {
            const { gen } = await getApi();
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({}),
            });
            mockConfig.resolveApiKey.mockReturnValue("sk_default");
            mockRetry.withRetry.mockImplementation((fn: () => unknown) => fn());

            await gen("/test", { apiKey: "sk_custom" });

            expect(mockConfig.resolveApiKey).toHaveBeenCalledWith("sk_custom");
        });

        it("should pass retryOptions to withRetry", async () => {
            const { gen } = await getApi();
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({}),
            });
            mockConfig.resolveApiKey.mockReturnValue("sk_key");
            mockRetry.withRetry.mockImplementation((fn: () => unknown) => fn());

            await gen("/test", { retry: true, retryOptions: { maxRetries: 5, baseDelay: 1000 } });

            expect(mockRetry.withRetry).toHaveBeenCalledWith(
                expect.any(Function),
                { maxRetries: 5, baseDelay: 1000 },
            );
        });
    });

    describe("genValidated", () => {
        it("should fetch and validate data with schema", async () => {
            const { genValidated } = await getApi();
            const rawData = { balance: 100 };
            const validatedData = { balance: 100 };
            const schema = z.object({ balance: z.number() });

            mockConfig.resolveApiKey.mockReturnValue("sk_key");
            mockRetry.withRetry.mockImplementation((fn: () => unknown) => fn());
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(rawData),
            });
            mockValidation.validate.mockReturnValue(validatedData);

            const result = await genValidated("/account/balance", schema);

            expect(result).toEqual(validatedData);
            expect(mockValidation.validate).toHaveBeenCalledWith(schema, rawData);
        });

        it("should propagate validation errors", async () => {
            const { genValidated } = await getApi();
            const rawData = { balance: "not-a-number" };
            const schema = z.object({ balance: z.number() });

            mockConfig.resolveApiKey.mockReturnValue("sk_key");
            mockRetry.withRetry.mockImplementation((fn: () => unknown) => fn());
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(rawData),
            });
            mockValidation.validate.mockImplementation(() => {
                throw new z.ZodError([
                    {
                        code: "invalid_type",
                        expected: "number",
                        received: "string",
                        path: ["balance"],
                        message: "Expected number, received string",
                    },
                ]);
            });

            await expect(genValidated("/account/balance", schema)).rejects.toThrow(z.ZodError);
        });
    });
});
