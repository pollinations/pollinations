import { printInfo } from "./output.js";

/**
 * Read piped stdin until EOF. With `waitMs`, stdin is optional: if no data
 * arrives within that time, stop reading and return "". Some callers (Node's
 * `exec`/`spawn`, agent harnesses) leave stdin open without writing to it.
 */
export async function readStdin(waitMs?: number): Promise<string> {
    if (process.stdin.isTTY) return "";
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
                resolve(Buffer.concat(chunks).toString("utf-8").trim());
            })
            .once("error", reject);
    });
}
