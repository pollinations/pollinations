// Writing a pinned image id into gen's wrangler.toml, kept out of build.mjs so
// it can be tested without the Azure calls that script makes as it loads.

/**
 * Replace the `AZURE_SANDBOX_IMAGE` line that follows `group`'s
 * `AZURE_SANDBOX_GROUP_URL` line, in every block that uses the group (local dev
 * reuses staging's group).
 *
 * A CRLF checkout keeps the `\r` at the end of every line, so comparing a line
 * to the expected text never matches: nothing was written and the build still
 * reported the new id. Lines are therefore compared without their ending, and
 * the file is written back with the ending it already used, so pinning changes
 * one line instead of rewriting the whole file. A group the file does not name
 * is an error rather than silence — the id would otherwise be lost.
 */
export function pinImage(toml, group, image) {
    const ending = toml.includes("\r\n") ? "\r\n" : "\n";
    const lines = toml.split("\n").map((line) => line.replace(/\r$/, ""));
    let pinned = 0;
    lines.forEach((line, i) => {
        if (line !== `AZURE_SANDBOX_GROUP_URL = "${group}"`) return;
        if (!lines[i + 1]?.startsWith("AZURE_SANDBOX_IMAGE = ")) {
            throw new Error(`no AZURE_SANDBOX_IMAGE line after ${group}`);
        }
        lines[i + 1] = `AZURE_SANDBOX_IMAGE = "${image}"`;
        pinned++;
    });
    if (!pinned) {
        throw new Error(`no AZURE_SANDBOX_GROUP_URL line for ${group}`);
    }
    return lines.join(ending);
}
