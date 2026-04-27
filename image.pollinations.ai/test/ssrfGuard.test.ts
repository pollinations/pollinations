import { describe, expect, test, vi } from "vitest";

vi.mock("node:dns", () => {
    const lookup = vi.fn(async (hostname: string) => {
        if (hostname === "evil-redirect.example")
            return [{ address: "169.254.169.254", family: 4 }];
        if (hostname === "good.example")
            return [{ address: "93.184.216.34", family: 4 }];
        if (hostname === "mixed.example")
            return [
                { address: "8.8.8.8", family: 4 },
                { address: "10.0.0.1", family: 4 },
            ];
        if (hostname === "unresolvable.example") throw new Error("ENOTFOUND");
        return [{ address: "1.1.1.1", family: 4 }];
    });
    return { promises: { lookup }, default: { promises: { lookup } } };
});

import {
    isPrivateIp,
    SsrfBlockedError,
    validateImageUrl,
} from "../src/utils/ssrfGuard.ts";

describe("isPrivateIp", () => {
    test("flags RFC1918 ranges", () => {
        expect(isPrivateIp("10.0.0.1")).toBe(true);
        expect(isPrivateIp("172.16.0.1")).toBe(true);
        expect(isPrivateIp("172.31.255.255")).toBe(true);
        expect(isPrivateIp("192.168.1.1")).toBe(true);
    });

    test("flags loopback and link-local", () => {
        expect(isPrivateIp("127.0.0.1")).toBe(true);
        expect(isPrivateIp("169.254.169.254")).toBe(true); // AWS metadata
        expect(isPrivateIp("0.0.0.0")).toBe(true);
    });

    test("flags CGNAT", () => {
        expect(isPrivateIp("100.64.0.1")).toBe(true);
        expect(isPrivateIp("100.127.255.255")).toBe(true);
    });

    test("allows public IPs", () => {
        expect(isPrivateIp("8.8.8.8")).toBe(false);
        expect(isPrivateIp("1.1.1.1")).toBe(false);
        expect(isPrivateIp("93.184.216.34")).toBe(false);
        expect(isPrivateIp("100.63.255.255")).toBe(false); // just below CGNAT
    });

    test("flags IPv6 loopback, ULA, link-local, multicast", () => {
        expect(isPrivateIp("::1")).toBe(true);
        expect(isPrivateIp("fc00::1")).toBe(true);
        expect(isPrivateIp("fd00::1")).toBe(true);
        expect(isPrivateIp("fe80::1")).toBe(true);
        expect(isPrivateIp("ff02::1")).toBe(true);
    });

    test("flags IPv4-mapped IPv6 to private addresses", () => {
        expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
        expect(isPrivateIp("::ffff:169.254.169.254")).toBe(true);
        expect(isPrivateIp("::ffff:8.8.8.8")).toBe(false);
    });

    test("rejects garbage", () => {
        expect(isPrivateIp("not-an-ip")).toBe(false);
        expect(isPrivateIp("")).toBe(false);
    });
});

describe("validateImageUrl", () => {
    test("allows data: URIs without DNS", async () => {
        const r = await validateImageUrl("data:image/png;base64,iVBORw0KGg=");
        expect(r.kind).toBe("data");
    });

    test("rejects empty / non-string input", async () => {
        await expect(validateImageUrl("")).rejects.toBeInstanceOf(
            SsrfBlockedError,
        );
        // @ts-expect-error testing runtime guard
        await expect(validateImageUrl(null)).rejects.toBeInstanceOf(
            SsrfBlockedError,
        );
    });

    test("rejects invalid URLs", async () => {
        await expect(validateImageUrl("not-a-url")).rejects.toBeInstanceOf(
            SsrfBlockedError,
        );
    });

    test("rejects file:, ftp:, gopher: schemes", async () => {
        await expect(validateImageUrl("file:///etc/passwd")).rejects.toThrow(
            /protocol/,
        );
        await expect(validateImageUrl("ftp://example.com/x")).rejects.toThrow(
            /protocol/,
        );
        await expect(
            validateImageUrl("gopher://example.com/x"),
        ).rejects.toThrow(/protocol/);
    });

    test("rejects localhost and *.localhost", async () => {
        await expect(validateImageUrl("http://localhost/x")).rejects.toThrow(
            /localhost/,
        );
        await expect(
            validateImageUrl("http://app.localhost/x"),
        ).rejects.toThrow(/localhost/);
    });

    test("rejects literal private IP hostnames", async () => {
        await expect(
            validateImageUrl("http://127.0.0.1/x"),
        ).rejects.toThrow(/private IP/);
        await expect(
            validateImageUrl("http://169.254.169.254/latest/meta-data/"),
        ).rejects.toThrow(/private IP/);
        await expect(
            validateImageUrl("http://10.0.0.1/x"),
        ).rejects.toThrow(/private IP/);
        await expect(validateImageUrl("http://[::1]/x")).rejects.toThrow(
            /private IP/,
        );
    });

    test("rejects hostnames that resolve to private IPs", async () => {
        await expect(
            validateImageUrl("https://evil-redirect.example/img.png"),
        ).rejects.toThrow(/private IP/);
    });

    test("rejects when ANY resolved address is private", async () => {
        await expect(
            validateImageUrl("https://mixed.example/img.png"),
        ).rejects.toThrow(/private IP/);
    });

    test("rejects unresolvable hostnames", async () => {
        await expect(
            validateImageUrl("https://unresolvable.example/img.png"),
        ).rejects.toThrow(/DNS lookup failed/);
    });

    test("allows public hostnames", async () => {
        const r = await validateImageUrl("https://good.example/img.png");
        expect(r.kind).toBe("http");
        if (r.kind === "http")
            expect(r.url.hostname).toBe("good.example");
    });

    test("allows literal public IPs", async () => {
        const r = await validateImageUrl("https://8.8.8.8/img.png");
        expect(r.kind).toBe("http");
    });
});
