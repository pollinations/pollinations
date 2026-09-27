import coreModules from "@cloudflare/computer/shell/core";

// @cloudflare/computer 0.3.x: the shell's filesystem adapter ignores the
// encoding just-bash passes. `cat >`, heredocs, `tee`, `<` and `base64 -d`
// write latin1 byte strings marked "binary", and the adapter UTF-8 encoded
// them again, so every non-ASCII byte was stored as two or more. This patches
// the bundled adapter until upstream honours the encoding. A patch that no
// longer applies throws at startup; the byte test in index.test.ts covers
// every write path.
const PATCHES: [string, string][] = [
    [
        "await this.#fs.writeFile(path, content);",
        "await this.#fs.writeFile(path, contentBytes(content, _options));",
    ],
    [
        'const addition = typeof content === "string" ? new TextEncoder().encode(content) : content;',
        "const addition = contentBytes(content, _options);",
    ],
];

const CONTENT_BYTES = `
function contentBytes(content, options) {
  if (typeof content !== "string") return content;
  const encoding = typeof options === "string" ? options : options?.encoding;
  if (encoding !== "binary" && encoding !== "latin1") {
    return new TextEncoder().encode(content);
  }
  const bytes = new Uint8Array(content.length);
  for (let i = 0; i < content.length; i++) bytes[i] = content.charCodeAt(i);
  return bytes;
}
`;

function patchShell(source: string): string {
    let patched = source;
    for (const [from, to] of PATCHES) {
        if (patched.split(from).length !== 2) {
            throw new Error(`computer shell patch no longer applies: ${from}`);
        }
        patched = patched.replace(from, () => to);
    }
    return patched + CONTENT_BYTES;
}

// Passed after the core modules, so it replaces the bundled shell.js.
export const shellBytesFix = {
    "shell.js": { js: patchShell(coreModules["shell.js"].js) },
};
