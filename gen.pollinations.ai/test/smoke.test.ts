import { SELF } from "cloudflare:test";
import { expect, test } from "vitest";

test("worker returns 302 redirect on /", async () => {
    const response = await SELF.fetch("http://localhost/", {
        redirect: "manual",
    });
    expect(response.status).toBe(302);
});
