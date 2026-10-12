import { env } from "cloudflare:test";
import { expect, test } from "vitest";

// The classes are tested with the text Worker; this checks their bindings here
test("the IP slot and feed hub are bound, unused until the adapter moves in", async () => {
    const slot = env.IP_SLOT.getByName("198.51.100.1");
    const taken = await slot.take(45_000, false);
    expect(taken.action).toBe("go");
    await slot.release(taken);
    expect((await slot.take(45_000, false)).action).toBe("pay");

    const feed = await env.FEED_HUB.getByName("image").fetch(
        "https://feed-hub.invalid/",
    );
    expect(feed.status).toBe(200);
    await feed.body.cancel();
});
