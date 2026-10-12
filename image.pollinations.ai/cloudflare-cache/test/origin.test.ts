import {
    createExecutionContext,
    env,
    fetchMock,
    runInDurableObject,
    waitOnExecutionContext,
} from "cloudflare:test";
import { PhotonImage } from "@cf-wasm/photon";
import { load, TagValues } from "piexif-ts/dist/piexif.js";
import { beforeAll, describe, expect, test, vi } from "vitest";
import worker from "../src/index.ts";
import { ImageParamsSchema } from "../src/params.ts";
import feedHeaders from "./fixtures/image.pollinations.ai-feed.headers?raw";
import primeHeaders from "./fixtures/image.pollinations.ai-prime.headers?raw";
import blockedBody from "./fixtures/vm-blocked-model-500.body?raw";
import blockedHeaders from "./fixtures/vm-blocked-model-500.headers?raw";
import vmFeedEvent from "./fixtures/vm-feed-event.body?raw";
import {
    alarmOf,
    call,
    capturedHeaders,
    limitedIp,
    nextIp,
    recordingGen,
    storedAt,
} from "./helpers.ts";

// The paywall's facilitator is stubbed in pay.test.ts; nothing here may
// reach the network
beforeAll(() => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
});

// The fixed gen responses are in vitest.config.ts
const TIMING_STEPS = [
    "Request received and queued.",
    "Start generating job",
    "Start processing",
    "Start prompt normalization and translation",
    "End prompt normalization and translation",
    "Generation completed.",
    "Image returned",
];
// The live free request whose headers prime.headers holds
const PRIME =
    "/prompt/weftbaseline-1791750449-a%20a%20small%20yellow%20flower?width=256&height=256&nologo=true";

/** The IP_SLOT alarm of an IP whose last generation ended: within the interval */
const released = async (ip: string) => {
    const alarm = await alarmOf(ip);
    return alarm !== null && alarm <= Date.now() + 45_000;
};

const binary = (bytes: Uint8Array) =>
    Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");

/** The UserComment JSON of a generated JPEG */
function userComment(jpeg: Uint8Array) {
    const comment = load(binary(jpeg)).Exif[TagValues.ExifIFD.UserComment];
    const bytes = Uint8Array.from(comment.slice(8), (char: string) =>
        char.charCodeAt(0),
    );
    return new TextDecoder().decode(bytes);
}

describe("parameters", () => {
    const parse = (query: Record<string, string | string[]>) =>
        ImageParamsSchema.parse(query);

    test("defaults, in the VM's key order", () => {
        const params = parse({});
        expect(params).toEqual({
            seed: 42,
            model: "sana",
            enhance: false,
            nologo: false,
            negative_prompt: "undefined",
            nofeed: false,
            safe: false,
            quality: "medium",
            image: [],
            transparent: false,
            width: 768,
            height: 768,
        });
        // As in the live error JSON: a side not given comes last
        expect(JSON.stringify(params)).toBe(
            '{"seed":42,"model":"sana","enhance":false,"nologo":false,"negative_prompt":"undefined","nofeed":false,"safe":false,"quality":"medium","image":[],"transparent":false,"width":768,"height":768}',
        );
    });

    test("sizes: the area is capped at 768² with the aspect ratio kept", () => {
        for (const [query, size] of [
            [{ width: "1920", height: "1080" }, [1024, 576]],
            [{ width: "512", height: "512" }, [512, 512]],
            [{ width: "2000" }, [1239, 475]],
            [{ width: "abc", height: "12.7" }, [768, 12]],
            [{ width: ["512", "600"] }, [512, 768]],
            [{ width: "0" }, [0, 768]],
        ] as const) {
            const { width, height } = parse(query as Record<string, string>);
            expect([width, height], JSON.stringify(query)).toEqual(size);
        }
    });

    test("seed: an integer, else 42, with no range clamp", () => {
        for (const [seed, expected] of [
            ["7", 7],
            ["-5", -5],
            ["3000000000", 3000000000],
            ["abc", 42],
            ["99999999999999999999", 42],
        ] as const) {
            expect(parse({ seed }).seed, seed).toBe(expected);
        }
    });

    test("safe, booleans and lists", () => {
        expect(parse({ safe: "TRUE" }).safe).toBe(true);
        expect(parse({ safe: "yes" }).safe).toBe(false);
        expect(parse({ private: "true" })).toMatchObject({ nofeed: true });
        expect(parse({ private: "true" })).not.toHaveProperty("private");
        expect(parse({ image: "a|b,c" }).image).toEqual(["a", "b,c"]);
        expect(parse({ image: "a,b" }).image).toEqual(["a", "b"]);
        expect(parse({ quality: "hd" }).quality).toBe("hd");
        expect(parse({ quality: "ultra" }).quality).toBe("medium");
        expect(parse({ guidance_scale: "1.5" }).guidance_scale).toBe(1.5);
    });

    test("models: aliases and unknown names become sana; three are kept and blocked", () => {
        for (const model of [
            undefined,
            "",
            "flux",
            "z-image",
            "turbo",
            "zimage",
            "gptimage",
            "dall-e",
        ]) {
            expect(parse(model === undefined ? {} : { model }).model).toBe(
                "sana",
            );
        }
        for (const model of ["kontext", "seedream", "nanobanana"]) {
            expect(parse({ model }).model).toBe(model);
        }
        // Their own default sizes
        expect(parse({ model: "kontext" })).toMatchObject({
            width: 1024,
            height: 1024,
        });
        expect(parse({ model: "seedream", width: "4096" })).toMatchObject({
            width: 4096,
            height: 1024,
        });
    });
});

test("a free GET answers the branded JPEG with the VM's headers and is stored", async () => {
    const { response, bytes } = await call(PRIME);

    expect(response.status).toBe(200);
    // Every header of the live response, Content-Length absent as there
    const headers = Object.fromEntries(response.headers);
    expect(headers["x-legacy-path"]).toBe("worker");
    delete headers["x-legacy-path"];
    expect(headers).toEqual(Object.fromEntries(capturedHeaders(primeHeaders)));
    const image = PhotonImage.new_from_byteslice(bytes);
    expect([image.get_width(), image.get_height()]).toEqual([256, 256]);
    image.free();

    const hit = await call(PRIME);
    expect(hit.response.headers.get("x-cache")).toBe("HIT");
    expect(hit.bytes).toEqual(bytes);
});

test("the EXIF UserComment is the VM's JSON, byte for byte", async () => {
    // A live VM image of 2026-10-11 for this path wrote this JSON
    const { bytes } = await call(
        "/prompt/weftprobe-f-3236312293?width=256&height=256&seed=7&nologo=true",
    );

    expect(load(binary(bytes))["0th"][TagValues.ImageIFD.Make]).toBe("sana");
    expect(userComment(bytes)).toBe(
        '{"prompt":"weftprobe-f-3236312293","originalPrompt":"weftprobe-f-3236312293","width":256,"height":256,"seed":7,"model":"sana","enhance":false,"nologo":true,"negative_prompt":"undefined","nofeed":false,"safe":false,"quality":"medium","image":[],"transparent":false,"isMature":false,"isChild":false,"trackingData":{"actualModel":"sana","usage":{"completionImageTokens":1,"totalTokenCount":1}}}',
    );
});

test("gen gets the VM's request: bridge key, sana, at least a megapixel, the seed and safe as given", async () => {
    const gen = recordingGen();
    await call("/prompt/a%0A+b%09c?width=512&height=256&seed=-3&safe=true", {
        testEnv: gen.testEnv,
    });
    await call("/prompt/dflt", { testEnv: gen.testEnv });

    const [first, second] = gen.requests;
    expect(first.url).toBe(
        "https://gen.pollinations.ai/image/a%2Bbc?model=sana&width=1448&height=724&seed=-3&safe=true&private=true",
    );
    expect(first.headers.get("authorization")).toBe("Bearer test-gen-key");
    expect(first.headers.get("accept")).toBe("image/jpeg");
    expect(second.url).toBe(
        "https://gen.pollinations.ai/image/dflt?model=sana&width=1024&height=1024&seed=42&safe=false&private=true",
    );
});

test("a blocked model gets the VM's 500 JSON before the free limit, with no gen call", async () => {
    const gen = recordingGen();
    const ip = nextIp();
    const { response, text } = await call(
        "/prompt/migration-probe-blocked?model=kontext",
        { ip, testEnv: gen.testEnv },
    );

    expect(response.status).toBe(500);
    const vm = JSON.parse(blockedBody);
    const body = JSON.parse(text);
    expect(body.requestId).toMatch(/^[0-9a-z]+$/);
    expect(JSON.stringify({ ...body, requestId: vm.requestId })).toBe(
        blockedBody.trim(),
    );
    const headers = Object.fromEntries(response.headers);
    delete headers["x-legacy-path"];
    expect(headers).toEqual(
        Object.fromEntries(capturedHeaders(blockedHeaders)),
    );
    expect(gen.requests).toHaveLength(0);
    expect(await alarmOf(ip)).toBeNull();

    for (const model of ["seedream", "nanobanana"]) {
        const blocked = await call(`/prompt/x?model=${model}`);
        expect(JSON.parse(blocked.text).message).toBe(
            `${model} model is only available on enter.pollinations.ai. Visit https://enter.pollinations.ai/?ref=image to get started.`,
        );
    }
});

test("a malformed % gets the VM's 500: urldecode's -1 failed its cache key", async () => {
    const gen = recordingGen();
    const { response, text } = await call("/prompt/bad%E0%A4-x", {
        testEnv: gen.testEnv,
    });

    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toMatchObject({
        error: "Internal Server Error",
        message: "prompt.replaceAll is not a function",
        debug: null,
        timingInfo: [],
        requestParameters: { prompt: -1 },
        queueInfo: null,
    });
    expect(gen.requests).toHaveLength(0);
});

test("gen failures and bodies that are not images get the VM's 500 JSON and are not stored", async () => {
    for (const [prompt, message] of [
        [
            "gen:503",
            'Gen Sana request failed with 503: {"error":"gen answered 503"}',
        ],
        [
            "gen:429",
            'Gen Sana request failed with 429: {"error":"gen answered 429"}',
        ],
        [
            "gen:400",
            'Gen Sana request failed with 400: {"error":"gen answered 400"}',
        ],
        ["gen:html", "Input buffer contains unsupported image format"],
        ["gen:empty", "Gen Sana returned an empty image"],
    ]) {
        const { response, text } = await call(`/prompt/${prompt}?seed=1`);

        expect(response.status, prompt).toBe(500);
        expect(response.headers.get("x-error-type"), prompt).toBe(
            "Internal Server Error",
        );
        expect(response.headers.get("content-type"), prompt).toBe(
            "application/json",
        );
        const body = JSON.parse(text);
        expect(body.message, prompt).toBe(message);
        expect(body.requestParameters).toMatchObject({ prompt, seed: 1 });
        // The steps the VM had reached when gen's answer failed
        expect(
            body.timingInfo.map(({ step }) => step),
            prompt,
        ).toEqual(TIMING_STEPS.slice(0, 5));
        expect(await storedAt(`/prompt/${prompt}?seed=1`), prompt).toBeNull();
    }
});

test("the VM's other routes: models, about, crossdomain, register, .well-known and 404s", async () => {
    const NO_STORE = {
        "content-type": "application/json",
        "cache-control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",
        pragma: "no-cache",
        expires: "0",
    };
    const models = await call("/models");
    expect(models.text).toBe('["sana"]');
    expect(models.response.headers.get("x-legacy-path")).toBeNull();
    expect(Object.fromEntries(models.response.headers)).toMatchObject({
        ...NO_STORE,
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "x-powered-by": "Pollinations.AI",
    });
    expect(JSON.parse((await call("/about")).text)).toEqual([
        { name: "sana", tier: "seed", enhance: true, maxSideLength: 768 },
        { name: "kontext", tier: "nectar", enhance: true, maxSideLength: 1024 },
        {
            name: "seedream",
            tier: "nectar",
            enhance: false,
            maxSideLength: 4096,
        },
        {
            name: "nanobanana",
            tier: "nectar",
            enhance: false,
            maxSideLength: 2048,
        },
    ]);
    const xml = await call("/crossdomain.xml", { method: "POST" });
    expect(xml.response.headers.get("content-type")).toBe("application/xml");
    expect(xml.text).toContain(
        '<allow-access-from domain="*" secure="false"/>',
    );

    // Changed: no GPU server registers here any more
    const listed = await call("/register");
    expect([listed.response.status, listed.text]).toEqual([200, "[]"]);
    expect(Object.fromEntries(listed.response.headers)).toMatchObject(NO_STORE);
    const registered = await call("/register", {
        method: "POST",
        headers: { "x-backend-token": "anything" },
        body: '{"url":"http://gpu"}',
    });
    expect([registered.response.status, registered.text]).toEqual([
        403,
        '{"success":false,"message":"Unauthorized"}',
    ]);
    const other = await call("/register", { method: "PUT" });
    expect(other.text).toBe('{"success":false,"message":"Method not allowed"}');

    // preMiddleware's 404 for paths kept as they were; the acme token too
    for (const [path, method, shown] of [
        [
            "/.well-known/acme-challenge/w7JbAPtwFN_ntyNHudgKYyaZ7qiesTl4LgFa4fBr1DuEL_Hyd4O3hdIviSop1S3G",
            "GET",
            "/.well-known/acme-challenge/w7JbAPtwFN_ntyNHudgKYyaZ7qiesTl4LgFa4fBr1DuEL_Hyd4O3hdIviSop1S3G",
        ],
        ["/models/", "GET", "/models/"],
        ["/delete/prompt/it's^", "GET", "/delete/prompt/it%27s%5E"],
    ]) {
        const { response, text } = await call(path, { method });
        expect(response.status, path).toBe(404);
        expect(JSON.parse(text), path).toEqual({
            error: "Not Found",
            message: "The requested endpoint was not found",
            path: shown,
        });
        expect(response.headers.get("content-type"), path).toBe(
            "application/json",
        );
    }
});

test("DELETE /delete/prompt/:prompt still removes a stored image", async () => {
    await call("/prompt/to%20delete");
    expect(await storedAt("/prompt/to%20delete")).not.toBeNull();

    const { response, text } = await call("/delete/prompt/to%20delete", {
        method: "DELETE",
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toMatchObject({ success: true, r2Deleted: true });
    expect(await storedAt("/prompt/to%20delete")).toBeNull();
});

test("other paths generate as /prompt{path}, uncached and without X-Cache", async () => {
    const gen = recordingGen();
    for (const [path, prompt] of [
        ["/a%20cat", "a cat"],
        ["/prompt/a/b", "a/b"],
        ["/", "random_prompt"],
        ["/promptless", "random_prompt"],
    ]) {
        const { response } = await call(path, { testEnv: gen.testEnv });
        expect(response.status, path).toBe(200);
        expect(response.headers.get("x-cache"), path).toBeNull();
        expect(response.headers.get("content-disposition"), path).toBe(
            `inline; filename="${prompt === "a/b" ? "ab" : prompt.replace(" ", "-").replace("_", "")}.jpg"`,
        );
        expect(gen.requests.at(-1).url, path).toContain(
            `/image/${encodeURIComponent(prompt)}?`,
        );
    }
    expect(await storedAt("/prompt/a%20cat")).toBeNull();
});

test("the method is ignored: a free POST generates and is stored", async () => {
    const { response } = await call("/prompt/posted", { method: "POST" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(await storedAt("/prompt/posted")).not.toBeNull();
});

test("Content-Disposition keeps the VM's file name rule", async () => {
    for (const [path, name] of [
        [
            "/prompt/Hello,%20World!%20%E2%9C%A8%20--test--",
            "hello-world-test.jpg",
        ],
        ["/prompt/%E2%9C%A8!!", "generated-image.jpg"],
    ]) {
        const { response } = await call(path);
        expect(response.headers.get("content-disposition"), path).toBe(
            `inline; filename="${name}"`,
        );
    }
});

test("a HEAD miss is not stored, so the next GET returns the full image", async () => {
    const head = await call("/prompt/head%20then%20get", { method: "HEAD" });
    expect(head.response.status).toBe(200);
    expect(head.response.headers.get("content-type")).toBe("image/jpeg");
    expect(head.bytes.byteLength).toBe(0);
    expect(await storedAt("/prompt/head%20then%20get")).toBeNull();

    // The HEAD booked this IP's slot, as on the VM; another IP gets the image
    const get = await call("/prompt/head%20then%20get");
    expect(get.response.headers.get("x-cache")).toBe("MISS");
    expect(get.bytes.byteLength).toBeGreaterThan(1000);
    const hit = await call("/prompt/head%20then%20get");
    expect(hit.response.headers.get("x-cache")).toBe("HIT");
    expect(hit.bytes).toEqual(get.bytes);
});

test("the IP is released when the generation succeeds, fails or throws", async () => {
    const completed = nextIp();
    await call("/prompt/released%20after%20success", { ip: completed });
    expect(await released(completed)).toBe(true);

    const failed = nextIp();
    const failure = await call("/prompt/gen:503", { ip: failed });
    expect(failure.response.status).toBe(500);
    expect(await released(failed)).toBe(true);

    const threw = nextIp();
    const throwing = {
        ...env,
        GEN: {
            fetch: async () => {
                throw new Error("gen unreachable");
            },
        },
    };
    const thrown = await call("/prompt/gen%20throws", {
        ip: threw,
        testEnv: throwing,
    });
    expect(thrown.response.status).toBe(500);
    expect(JSON.parse(thrown.text).message).toBe("gen unreachable");
    expect(await released(threw)).toBe(true);
});

test("without every WEFT_* value the paywall is off: a running generation gives the VM's 429, spacing waits", async () => {
    const off = { ...env, WEFT_SELLER_API_KEY: undefined };
    const ip = await limitedIp();

    const held = await call("/prompt/weft%20off", { ip, testEnv: off });

    expect(held.response.status).toBe(429);
    expect(held.response.headers.get("x-error-type")).toBe("Too Many Requests");
    expect(JSON.parse(held.text)).toMatchObject({
        error: "Too Many Requests",
        message: `Queue full for IP: ${ip}: 1 requests already queued (max: 1). Get unlimited access at https://enter.pollinations.ai`,
        debug: null,
        timingInfo: [{ step: "Request received and queued.", timestamp: 0 }],
        queueInfo: {
            ip,
            currentSize: 0,
            pending: 1,
            total: 1,
            maxAllowed: 1,
            username: null,
            userId: null,
            tier: "anonymous",
        },
    });

    // The last free generation started 44.8 s ago and has ended
    const spaced = nextIp();
    await runInDurableObject(env.IP_SLOT.getByName(spaced), (_slot, state) =>
        state.storage.setAlarm(Date.now() + 200),
    );
    const waited = await call("/prompt/weft%20off%20waits", {
        ip: spaced,
        testEnv: off,
    });
    expect(waited.response.status).toBe(200);
    expect(waited.response.headers.get("content-type")).toBe("image/jpeg");
});

test("a limiter failure is answered as a free request, booking and releasing nothing", async () => {
    const gen = recordingGen();
    const calls: string[] = [];
    const failing = {
        getByName: () => ({
            take: async () => {
                calls.push("take");
                throw new Error("IpSlot RPC failed");
            },
            release: async () => calls.push("release"),
        }),
    };

    const { response } = await call("/prompt/limiter%20down", {
        testEnv: { ...gen.testEnv, IP_SLOT: failing },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
        "public, max-age=31536000, immutable",
    );
    expect(gen.requests).toHaveLength(1);
    expect(calls).toEqual(["take"]);
});

describe("feed", () => {
    /**
     * A listener on the Worker's /feed: next() reads one server-sent event,
     * leave() disconnects and waits until the hub has dropped it
     */
    const listen = async (path: string) => {
        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request(`https://image.pollinations.ai${path}`),
            env,
            ctx,
        );
        const events = response.body.getReader();
        let pending = "";
        const next = async () => {
            while (!pending.includes("\n\n")) {
                pending += new TextDecoder().decode(
                    (await events.read()).value,
                );
            }
            const at = pending.indexOf("\n\n");
            const line = pending.slice(0, at);
            pending = pending.slice(at + 2);
            expect(line).toMatch(/^data: /);
            return JSON.parse(line.slice("data: ".length));
        };
        const leave = async () => {
            await events.cancel();
            await waitOnExecutionContext(ctx);
            // The hub notices at its next event (one that is not kept)
            await env.FEED_HUB.getByName("image").publish("data: {}\n\n");
            await expect
                .poll(() =>
                    runInDurableObject(
                        env.FEED_HUB.getByName("image"),
                        (hub) => hub.writers.size,
                    ),
                )
                .toBe(0);
        };
        return { response, next, leave };
    };

    test("each public generation reaches listeners as the VM sent it; private and mature ones do not", async () => {
        // A password is ignored. A negative count replays only kept events
        // past the 50th, so none of this file's earlier ones.
        const { response, next, leave } = await listen(
            "/feed?password=x&past_results=-50",
        );
        // Every header of the live feed
        expect(Object.fromEntries(response.headers)).toEqual(
            Object.fromEntries(capturedHeaders(feedHeaders)),
        );

        await call("/prompt/private%201?nofeed=true");
        await call("/prompt/private%202?private=true");
        // "ass" is a mature word, matched anywhere in the prompt
        await call("/prompt/a%20grassy%20field");

        // The live event of 2026-10-11, generated again
        const vm = JSON.parse(vmFeedEvent.slice("data: ".length));
        await call(vm.imageURL.slice("https://image.pollinations.ai".length));
        const event = await next();
        expect(Object.keys(event)).toEqual(Object.keys(vm));
        expect(event.timingInfo.map(({ step }) => step)).toEqual(TIMING_STEPS);
        expect(event.timingInfo[0].timestamp).toBe(0);
        expect({ ...event, timingInfo: vm.timingInfo }).toEqual(vm);

        // Referrer and the start of a token
        await call("/feed%20me?token=sk_secret&seed=3", {
            headers: { referer: "https://app.example" },
        });
        expect(await next()).toMatchObject({
            prompt: "feed me",
            seed: 3,
            imageURL:
                "https://image.pollinations.ai/prompt/feed%20me?token=sk_secret&seed=3",
            referrer: "https://app.example",
            token: "sk...",
        });
        await call("/prompt/bearer", {
            headers: { authorization: "Bearer pk_abc" },
        });
        expect((await next()).token).toBe("pk...");
        await leave();

        // The VM never answered a HEAD
        const head = await call("/feed", { method: "HEAD" });
        expect(head.response.status).toBe(200);
        expect(head.text).toBe("");
    });

    test("a new listener gets the last past_results kept events (default 20), private ones skipped", async () => {
        const hub = env.FEED_HUB.getByName("replay");
        const line = (n: number) => `data: {"n":${n}}\n\n`;
        for (let n = 1; n <= 60; n++) {
            await hub.publish(n % 10 === 0 ? null : line(n), true);
        }
        // The text feed publishes without keeping: nothing to replay
        await hub.publish(line(61));

        const replayed = async (search: string) => {
            const stream = (
                await hub.fetch(`https://feed-hub.invalid/${search}`)
            ).body.getReader();
            let text = "";
            for (;;) {
                const pending = stream.read();
                // The runtime rejects a read still pending at the cancel
                pending.catch(() => {});
                const read = await Promise.race([
                    pending,
                    new Promise<null>((resolve) =>
                        setTimeout(resolve, 50, null),
                    ),
                ]);
                if (!read || read.done) break;
                text += new TextDecoder().decode(read.value);
            }
            await stream.cancel();
            return [...text.matchAll(/"n":(\d+)/g)].map(([, n]) => Number(n));
        };
        // 50 kept: 11..60, of which 20, 30, 40, 50, 60 reached no listener
        expect(await replayed("")).toEqual([
            41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 52, 53, 54, 55, 56, 57, 58,
            59,
        ]);
        expect(await replayed("?past_results=3")).toEqual([58, 59]);
        expect(await replayed("?past_results=0")).toHaveLength(18);
        expect((await replayed("?past_results=100"))[0]).toBe(11);
        expect(await replayed("?past_results=-45")).toEqual([56, 57, 58, 59]);
        expect(
            await runInDurableObject(hub, (feedHub) => feedHub.history.length),
        ).toBe(50);
    });

    test("a generation is in the replay of a later listener", async () => {
        await call("/prompt/for%20the%20replay");
        const { next, leave } = await listen("/feed?past_results=50");
        const prompts = [];
        // The last 50 events of this file, read until this one
        for (let i = 0; i < 50; i++) {
            const { prompt } = await next();
            prompts.push(prompt);
            if (prompt === "for the replay") break;
        }
        expect(prompts.at(-1)).toBe("for the replay");
        await leave();
    });
});

test("ADAPTER_SHARE 0 sends every generating path to the VM", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
        async () =>
            new Response("from the vm", {
                headers: { "content-type": "image/jpeg" },
            }),
    );
    const testEnv = { ...env, ADAPTER_SHARE: "0" };

    for (const [path, stored] of [
        ["/prompt/to%20the%20vm", true],
        ["/rewritten%20to%20the%20vm", false],
    ] as const) {
        const { response, text } = await call(path, { testEnv });
        expect(text, path).toBe("from the vm");
        expect(response.headers.get("x-legacy-path"), path).toBe("vm");
        const key = path.startsWith("/prompt") ? path : `/prompt${path}`;
        expect((await storedAt(key)) !== null, path).toBe(stored);
    }
    // Below 100 the feed is the VM's, which has most events
    const feed = await call("/feed", {
        testEnv: { ...env, ADAPTER_SHARE: "99" },
    });
    expect(feed.text).toBe("from the vm");
    // The fixed routes are answered here at any share
    expect((await call("/models", { testEnv })).text).toBe('["sana"]');
});

test("an exception on a miss path is Hono's 500, labelled with the path", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("tunnel down"));
    const onVm = await call("/prompt/tunnel%20down", {
        testEnv: { ...env, ADAPTER_SHARE: "0" },
    });
    expect(onVm.response.status).toBe(500);
    expect(onVm.text).toBe("Internal Server Error");
    expect(onVm.response.headers.get("x-legacy-path")).toBe("vm");

    // A side past 2^53 threw outside the VM's try (and crashed it)
    const huge = await call("/prompt/huge?width=9007199254740993");
    expect(huge.response.status).toBe(500);
    expect(huge.text).toBe("Internal Server Error");
    expect(huge.response.headers.get("x-legacy-path")).toBe("worker");
});
