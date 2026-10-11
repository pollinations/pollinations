import { printInfo } from "./output.js";

export interface ReadStdinOptions {
    waitMs?: number;
    trim?: boolean;
}

/**
 * Read piped stdin until EOF. With `waitMs`, stdin is optional: if no data
 * arrives within that time, stop reading and return "". Some callers (Node's
 * `exec`/`spawn`, agent harnesses) leave stdin open without writing to it.
 */
export async function readStdin(
    waitMsOrOptions?: number | ReadStdinOptions,
    options?: ReadStdinOptions,
): Promise<string> {
    if (process.stdin.isTTY) return "";
    const resolvedOptions =
        typeof waitMsOrOptions === "number"
            ? { waitMs: waitMsOrOptions, ...options }
            : { ...waitMsOrOptions, ...options };
    const { waitMs, trim = true } = resolvedOptions;
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
        const timer =
            waitMs === undefined
                ? undefined
                : setTimeout(() => {
                      process.stdin.destroy();
                      printInfo(
                          `No stdin within ${waitMs / 1000}s, continuing without it. Use < /dev/null to skip the wait.`,
                      );
                      resolve("");
                  }, waitMs);
        process.stdin
            .on("data", (chunk: Buffer) => {
                clearTimeout(timer);
                chunks.push(chunk);
            })
            .once("end", () => {
                clearTimeout(timer);
                const raw = Buffer.concat(chunks).toString("utf-8");
                resolve(trim ? raw.trim() : raw);
            })
            .once("error", reject);
    });
}
