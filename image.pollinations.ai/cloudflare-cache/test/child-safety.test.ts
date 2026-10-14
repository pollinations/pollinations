import { env, fetchMock } from "cloudflare:test";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { generateCacheKey } from "../src/cache-utils.ts";
import { asksForSexualContentWithMinors } from "../src/child-safety.ts";
import { alarmOf, call, nextIp, recordingGen, storedAt } from "./helpers.ts";

beforeAll(() => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
});

describe("prompts asking for sexual content with minors", () => {
    test.each([
        "nude child",
        "naked kids on a beach",
        "preteen girl, nsfw",
        "a 12 year old, topless",
        "13yo nude",
        "Desnuda Niña",
        "lolicon",
        "child+porn",
        "young_teen_naked",
        "幼女 裸体",
        "голая девочка",
        // hidden characters: the generator strips control characters
        "nu\u0001de child",
        "nu\u200bde child",
        "nude\nchild",
        // only an age of 18 or 19 right by the word makes a teen an adult
        "nude teen, shot by a 40 year old photographer",
        "18 year old teen and her teen friend, nude",
        "a 0 year old, nude",
    ])("refuses %j", (prompt) => {
        expect(asksForSexualContentWithMinors(prompt)).toBe(true);
    });

    test.each([
        "a child flying a kite",
        "kids birthday party, balloons",
        "nude portrait of a woman, oil painting",
        "sexy 25 year old model in lingerie",
        "18 year old teen, nude",
        "nude teen aged 19",
        "naked tree in winter",
        "a teenager skateboarding",
        "piano sheet in a minor key",
    ])("allows %s", (prompt) => {
        expect(asksForSexualContentWithMinors(prompt)).toBe(false);
    });
});

test("a refused prompt gets a 400 before the free limit, with no gen call and nothing stored", async () => {
    const gen = recordingGen();
    const ip = nextIp();
    const { response, text } = await call("/prompt/nude%20child", {
        ip,
        testEnv: gen.testEnv,
    });

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(JSON.parse(text)).toMatchObject({
        status: 400,
        success: false,
        error: { code: "CONTENT_BLOCKED" },
    });
    expect(gen.requests).toHaveLength(0);
    expect(await storedAt("/prompt/nude%20child")).toBeNull();
    expect(await alarmOf(ip)).toBeNull();
});

test("an image stored before the rule is no longer served", async () => {
    const path = "/prompt/naked%20kids";
    await env.IMAGE_BUCKET.put(
        generateCacheKey(new URL(`https://image.pollinations.ai${path}`)),
        new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
        { httpMetadata: { contentType: "image/jpeg" } },
    );

    const { response } = await call(path);

    expect(response.status).toBe(400);
    expect(response.headers.get("x-cache")).toBeNull();
});

test("other paths are checked as well", async () => {
    const gen = recordingGen();
    const { response } = await call("/naked%20kids", { testEnv: gen.testEnv });

    expect(response.status).toBe(400);
    expect(gen.requests).toHaveLength(0);
});

test("each refusal is logged without the prompt", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await call("/prompt/nude%20child");
    const lines = errors.mock.calls.map(([line]) => String(line));
    errors.mockRestore();

    const logged = lines.find((line) => line.includes("child_safety"));
    expect(logged).toBeDefined();
    expect(logged).not.toContain("nude");
});
