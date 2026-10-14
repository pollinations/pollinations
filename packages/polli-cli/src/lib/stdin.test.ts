import { PassThrough } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
import { readStdin } from "./stdin.js";

const originalStdin = Object.getOwnPropertyDescriptor(process, "stdin");

afterEach(() => {
    vi.restoreAllMocks();
    if (originalStdin) Object.defineProperty(process, "stdin", originalStdin);
});

function openStdin() {
    const stream = new PassThrough();
    Object.defineProperty(process, "stdin", {
        configurable: true,
        value: stream,
    });
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    return stream;
}

it("stops waiting for optional stdin that stays open without data", async () => {
    openStdin();
    await expect(readStdin(20)).resolves.toBe("");
});

it("reads optional stdin to EOF once data starts within the wait", async () => {
    const stdin = openStdin();
    const text = readStdin(20);
    stdin.write("some ");
    setTimeout(() => stdin.end("context"), 50);
    await expect(text).resolves.toBe("some context");
});
