import coreModules from "@cloudflare/computer/shell/core";

// @cloudflare/computer 0.3.x: the shell's filesystem adapter ignores the
// encoding just-bash passes. `cat >`, heredocs, `tee`, `<` and `base64 -d`
// write latin1 byte strings marked "binary", and the adapter UTF-8 encoded
// them again, so every non-ASCII byte was stored as two or more. This patches
// the bundled adapter until upstream honours the encoding. just-bash's `read`
// and `mapfile` also store stdin's byte string in variables without decoding
// it, so `echo "$line"` encoded each byte again. `$(...)` did the same with
// the output it captured, so `x=$(printf 'Época')` held 8 characters, not 6.
// A patch that no longer applies throws at startup; the byte tests in
// index.test.ts cover every path.
const PATCHES: [string, string][] = [
    [
        "await this.#fs.writeFile(path, content);",
        "await this.#fs.writeFile(path, contentBytes(content, _options));",
    ],
    [
        'const addition = typeof content === "string" ? new TextEncoder().encode(content) : content;',
        "const addition = contentBytes(content, _options);",
    ],
    // read: the line it collected, before it is split into variables.
    [
        "g === `\n` && w.endsWith(`\n`) && (w = w.slice(0, -1));",
        "g === `\n` && w.endsWith(`\n`) && (w = w.slice(0, -1));\n  w = textFromBytes(w);",
    ],
    // mapfile: each line, before it becomes an array element.
    [
        '"string_length");\n    f3.push(g);',
        '"string_length");\n    f3.push(textFromBytes(g));',
    ],
    // $(...): the captured output, before trailing newlines are stripped.
    [
        'let m4 = h5.stdout.replace(/\\n+$/, "");',
        'let m4 = textFromBytes(h5.stdout).replace(/\\n+$/, "");',
    ],
    // $(...) whose last command exited through `exit` or `return`.
    [
        'let p3 = h5.stdout.replace(/\\n+$/, "");',
        'let p3 = textFromBytes(h5.stdout).replace(/\\n+$/, "");',
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

// Decodes a byte string as UTF-8; text or invalid UTF-8 stays unchanged.
function textFromBytes(value) {
  if (!/[\\x80-\\xff]/.test(value) || /[^\\x00-\\xff]/.test(value)) return value;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(value, (char) => char.charCodeAt(0)),
    );
  } catch {
    return value;
  }
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
