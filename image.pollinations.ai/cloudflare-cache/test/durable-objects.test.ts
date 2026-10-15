import { env } from "cloudflare:test";
import { expect, test } from "vitest";

// The class is tested with the text Worker; this checks its binding here
test("the IP slot is bound", async () => {
    const slot = env.IP_SLOT.getByName("198.51.100.1");
    const taken = await slot.take(45_000, false);
    expect(taken.action).toBe("go");
    await slot.release(taken);
    expect((await slot.take(45_000, false)).action).toBe("pay");
});
