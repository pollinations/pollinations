import { env, fetchMock, runInDurableObject } from "cloudflare:test";
import { PhotonImage } from "@cf-wasm/photon";
import { beforeAll, describe, expect, test } from "vitest";
import { ImageParamsSchema } from "../src/params.ts";
import primeHeaders from "./fixtures/image.pollinations.ai-prime.headers?raw";
import blockedBody from "./fixtures/vm-blocked-model-500.body?raw";
import blockedHeaders from "./fixtures/vm-blocked-model-500.headers?raw";
// The Exif APP1 segments of VM images, marker included
import vmExifControl from "./fixtures/vm-exif-control.bin";
import vmExifLive from "./fixtures/vm-exif-live.bin";
import vmExifRedFox from "./fixtures/vm-exif-red-fox.bin";
import vmExifUnicode from "./fixtures/vm-exif-unicode.bin";
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
];
// The live free request whose headers prime.headers holds
const PRIME =
    "/prompt/weftbaseline-1791750449-a%20a%20small%20yellow%20flower?width=256&height=256&nologo=true";

/** The IP_SLOT alarm of an IP whose last generation ended: within the interval */
const released = async (ip: string) => {
    const alarm = await alarmOf(ip);
    return alarm !== null && alarm <= Date.now() + 45_000;
};

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
    expect(headers).toEqual(Object.fromEntries(capturedHeaders(primeHeaders)));
    const image = PhotonImage.new_from_byteslice(bytes);
    expect([image.get_width(), image.get_height()]).toEqual([256, 256]);
    image.free();

    const hit = await call(PRIME);
    expect(hit.response.headers.get("x-cache")).toBe("HIT");
    expect(hit.bytes).toEqual(bytes);
});

test("the Exif segment follows the start marker and is the VM's, byte for byte", async () => {
    for (const [path, vm] of [
        // A live image of 2026-10-11
        [
            "/prompt/weftprobe-f-3236312293?width=256&height=256&seed=7&nologo=true",
            vmExifLive,
        ],
        // Images of the VM replica of 2026-10-12: libvips wrote non-ASCII
        // characters as GLib's ASCII ("café 😀" as "cafe ?")
        ["/prompt/p9r1-c101%20a%20red%20fox", vmExifRedFox],
        ["/prompt/p9r1-c115g%20caf%C3%A9%20%F0%9F%98%80", vmExifUnicode],
        ["/prompt/p9r1-c115b%0Aline%09tab%7Fdel%C2%85nel", vmExifControl],
    ] as const) {
        const { bytes } = await call(path);
        const segment = new Uint8Array(vm);
        expect([...bytes.subarray(0, 2)], path).toEqual([0xff, 0xd8]);
        expect(bytes.subarray(2, 2 + segment.length), path).toEqual(segment);
    }
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

test("gen gets the caller's IP and referrer: the query, then the headers", async () => {
    const gen = recordingGen();
    const ip = nextIp();
    const site = { referer: "https://site.example/page" };
    await call("/prompt/caller-query?referrer=my-app", {
        ip,
        headers: site,
        testEnv: gen.testEnv,
    });
    await call("/prompt/caller-header", {
        headers: site,
        testEnv: gen.testEnv,
    });
    await call("/prompt/caller-odd?referrer=caf%C3%A9", {
        testEnv: gen.testEnv,
    });

    const [query, header, odd] = gen.requests;
    expect(query.headers.get("cf-connecting-ip")).toBe(ip);
    expect(query.headers.get("referer")).toBe("my-app");
    expect(header.headers.get("referer")).toBe("https://site.example/page");
    // A value no header can carry is left out, and the generation still runs
    expect(odd.headers.get("referer")).toBeNull();
    expect(odd.headers.get("authorization")).toBe("Bearer test-gen-key");
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
        ).toEqual(TIMING_STEPS);
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
        // Changed: the public feed is gone
        ["/feed?past_results=20", "GET", "/feed"],
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

// Changed: anyone could delete any stored image, so the route is gone
test("DELETE /delete/prompt/:prompt answers the 404 and keeps the stored image", async () => {
    await call("/prompt/to%20keep");
    expect(await storedAt("/prompt/to%20keep")).not.toBeNull();

    const { response, text } = await call("/delete/prompt/to%20keep", {
        method: "DELETE",
    });

    expect(response.status).toBe(404);
    expect(JSON.parse(text)).toEqual({
        error: "Not Found",
        message: "The requested endpoint was not found",
        path: "/delete/prompt/to%20keep",
    });
    expect(await storedAt("/prompt/to%20keep")).not.toBeNull();
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

test("an exception on a miss path is Hono's 500", async () => {
    // A side past 2^53 threw outside the VM's try (and crashed it)
    const huge = await call("/prompt/huge?width=9007199254740993");
    expect(huge.response.status).toBe(500);
    expect(huge.text).toBe("Internal Server Error");
});
