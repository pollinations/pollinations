import { afterEach, assert, describe, expect, it, vi } from "vitest";
import { type FallbackAttempt, withModelFallback } from "../../src/fallback.ts";
import { createTextAttemptBudget } from "../../src/text/attemptBudget.ts";

const primary = "deepseek/deepseek-v4.1-flash";
const fallback = `${primary}:fireworks`;
const candidates = [{ id: primary }, { id: fallback }];

afterEach(() => vi.useRealTimers());

describe("text fallback response budget", () => {
    it.each([primary, "z-ai/glm-5.3"])(
        "aborts %s at 120s and gives the fallback only the remaining 170s",
        async (primary) => {
            const candidates = [
                { id: primary },
                { id: `${primary}:fireworks` },
            ];
            vi.useFakeTimers();
            const budget = createTextAttemptBudget(primary);
            const attempts: FallbackAttempt[] = [];
            const timeouts: number[] = [];
            const signals: AbortSignal[] = [];
            const run = withModelFallback(
                candidates,
                ({ id }) =>
                    budget.run(id, async (timing) => {
                        assert(timing);
                        timeouts.push(timing.timeoutMs);
                        return timing.fetcher(async (_input, init) => {
                            assert(init?.signal);
                            signals.push(init.signal);
                            return new Promise<Response>((_resolve, reject) => {
                                init?.signal?.addEventListener("abort", () =>
                                    reject(init.signal?.reason),
                                );
                            });
                        })(`https://provider.test/${id}`);
                    }),
                attempts,
                undefined,
                budget.shouldFallback,
            );
            const failed = expect(run).rejects.toMatchObject({ status: 504 });
            await vi.advanceTimersByTimeAsync(120_000);
            expect(timeouts).toEqual([120_000, 170_000]);
            expect(signals.map((signal) => signal.aborted)).toEqual([
                true,
                false,
            ]);
            expect(attempts[0]).toMatchObject({
                error: { status: 504 },
                settled: false,
            });
            await vi.advanceTimersByTimeAsync(170_000);
            await failed;
            expect(signals.map((signal) => signal.aborted)).toEqual([
                true,
                true,
            ]);
            expect(attempts).toHaveLength(2);
            expect(attempts[1]).toMatchObject({
                error: { status: 504 },
                settled: true,
            });
        },
    );

    it("subtracts primary errors and preparation time from the shared deadline", async () => {
        vi.useFakeTimers();
        const budget = createTextAttemptBudget(primary);
        const timeouts: number[] = [];
        const run = withModelFallback(
            candidates,
            ({ id }) =>
                budget.run(id, async (timing) => {
                    assert(timing);
                    if (id === primary) {
                        await new Promise((resolve) =>
                            setTimeout(resolve, 20_000),
                        );
                        throw Object.assign(new Error("overloaded"), {
                            status: 503,
                        });
                    }
                    await new Promise((resolve) => setTimeout(resolve, 5_000));
                    return timing.fetcher(async (_input, init) => {
                        timeouts.push(
                            Number(
                                new Headers(init?.headers).get(
                                    "x-portkey-request-timeout",
                                ),
                            ),
                        );
                        return new Response("ready");
                    })("https://portkey.test/v1/chat/completions", {
                        headers: {
                            "x-portkey-request-timeout": String(
                                timing.timeoutMs,
                            ),
                        },
                    });
                }),
            undefined,
            undefined,
            budget.shouldFallback,
        );
        await vi.advanceTimersByTimeAsync(25_000);
        expect((await run).candidate.id).toBe(fallback);
        expect(timeouts).toEqual([265_000]);
    });

    it.each([120_000, 290_000])(
        "distinguishes Portkey's %sms envelope from the overall deadline",
        async (elapsed) => {
            vi.useFakeTimers();
            const budget = createTextAttemptBudget(primary);
            const failure = Object.assign(new Error("provider timeout"), {
                upstreamStatus: 408,
                details: {
                    error: {
                        type: "timeout_error",
                        message: `Request exceeded the timeout sent in the request: ${elapsed}ms`,
                    },
                },
            });
            const attempted = budget.run(primary, async () => {
                vi.setSystemTime(Date.now() + elapsed);
                throw failure;
            });
            await expect(attempted).rejects.toBe(failure);
            expect(budget.shouldFallback(failure)).toBe(elapsed < 290_000);
        },
    );

    it("never restarts or cancels an accepted stream after either deadline", async () => {
        vi.useFakeTimers();
        const budget = createTextAttemptBudget(primary);
        let signal: AbortSignal | undefined;
        const upstream = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode("accepted"));
            },
        });
        const operation = vi.fn(({ id }: { id: string }) =>
            budget.run(id, (timing) => {
                assert(timing);
                return timing.fetcher(async (_input, init) => {
                    signal = init?.signal ?? undefined;
                    return new Response(upstream);
                })("https://provider.test");
            }),
        );
        const { result } = await withModelFallback(
            candidates,
            operation,
            undefined,
            undefined,
            budget.shouldFallback,
        );
        await vi.advanceTimersByTimeAsync(300_000);
        expect(signal?.aborted).toBe(false);
        expect(operation).toHaveBeenCalledOnce();
        assert(result.body);
        const reader = result.body.getReader();
        expect(new TextDecoder().decode((await reader.read()).value)).toBe(
            "accepted",
        );
        await reader.cancel();
    });

    it("does not start a fallback after the shared deadline has elapsed", async () => {
        vi.useFakeTimers();
        const budget = createTextAttemptBudget(primary);
        vi.setSystemTime(Date.now() + 290_000);
        const operation = vi.fn();
        let failure: unknown;
        try {
            await budget.run(fallback, operation);
        } catch (error) {
            failure = error;
        }
        expect(operation).not.toHaveBeenCalled();
        expect(failure).toMatchObject({ status: 504 });
        expect(budget.shouldFallback(failure)).toBe(false);
    });

    it("keeps the shared deadline terminal when canceled primary preparation finishes late", async () => {
        vi.useFakeTimers();
        const budget = createTextAttemptBudget(primary);
        let resume = () => {};
        const fetcher = vi.fn();
        const first = budget
            .run(primary, async (timing) => {
                assert(timing);
                await new Promise<void>((resolve) => {
                    resume = resolve;
                });
                return timing.fetcher(fetcher)("https://provider.test");
            })
            .catch((error) => error);
        await vi.advanceTimersByTimeAsync(120_000);
        expect(budget.shouldFallback(await first)).toBe(true);
        const last = budget
            .run(fallback, () => new Promise(() => {}))
            .catch((error) => error);
        await vi.advanceTimersByTimeAsync(170_000);
        const terminal = await last;
        resume();
        await vi.advanceTimersByTimeAsync(0);
        expect(fetcher).not.toHaveBeenCalled();
        expect(budget.shouldFallback(terminal)).toBe(false);
    });

    it("preserves Request headers and the caller abort signal", async () => {
        const budget = createTextAttemptBudget(primary);
        const caller = new AbortController();
        let signal: AbortSignal | undefined;
        await budget.run(primary, (timing) => {
            assert(timing);
            return timing.fetcher(async (_input, init) => {
                signal = init?.signal ?? undefined;
                expect(new Headers(init?.headers).get("x-test-header")).toBe(
                    "preserved",
                );
                return new Response("ready");
            })(
                new Request("https://provider.test", {
                    headers: { "x-test-header": "preserved" },
                    signal: caller.signal,
                }),
            );
        });
        caller.abort();
        expect(signal?.aborted).toBe(true);
    });

    it("leaves models without a declared early fallback budget unchanged", async () => {
        const budget = createTextAttemptBudget("mistralai/mistral-small-4");
        const operation = vi.fn(async (timing) => timing);
        await expect(
            budget.run("mistralai/mistral-small-4", operation),
        ).resolves.toBeUndefined();
        expect(operation).toHaveBeenCalledWith();
        await expect(budget.run(primary, operation)).resolves.toBeUndefined();
    });
});
