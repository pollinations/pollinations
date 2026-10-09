import { FitAddon } from "./vendor/fit/lib/addon-fit.mjs";
import { WebglAddon } from "./vendor/webgl/lib/addon-webgl.mjs";
import { Terminal } from "./vendor/xterm/lib/xterm.mjs";

let previous;
export function openPiTerminal(container, pty, exitFullscreen) {
    previous?.dispose();
    const terminal = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "monospace",
        scrollback: 1500,
        screenReaderMode: true,
        theme: {
            background: "#142d29",
            foreground: "#dbe9d5",
            cursor: "#d0ed62",
        },
    });
    previous = terminal;
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container);
    const gpu = new WebglAddon();
    gpu.onContextLoss(() => gpu.dispose());
    try {
        terminal.loadAddon(gpu);
    } catch {
        gpu.dispose(); /* Keep xterm's normal renderer when WebGL2 is unavailable. */
    }
    terminal.textarea.setAttribute("aria-label", "Real Pi terminal input");
    const input = terminal.onData((data) => {
        if (data === "\x1b" && exitFullscreen()) return;
        pty.stdin.write(data).catch(() => {});
    });
    const resize = terminal.onResize(({ cols, rows }) =>
        pty.resizeTerminal(cols, rows),
    );
    let resizeFrame;
    const observer = new ResizeObserver(() => {
        if (resizeFrame) return;
        resizeFrame = requestAnimationFrame(() => {
            resizeFrame = null;
            fit.fit();
        });
    });
    observer.observe(container);
    fit.fit();
    pty.resizeTerminal(terminal.cols, terminal.rows);
    terminal.focus();
    let chunks = [],
        queued = 0,
        timer,
        parsed = Promise.resolve(),
        transcript = "";
    function flush() {
        clearTimeout(timer);
        timer = null;
        if (!chunks.length) return parsed;
        const text = chunks.join("");
        transcript = (transcript + text).slice(-200000);
        chunks = [];
        queued = 0;
        parsed = new Promise((resolve) => terminal.write(text, resolve));
        return parsed;
    }
    return {
        // Drain small PTY chunks together; backpressure only at a bounded batch.
        write: (text) => {
            chunks.push(text);
            queued += text.length;
            if (queued >= 65536) return flush();
            if (!timer) timer = setTimeout(flush, 16);
        },
        output: () => transcript,
        close: async () => {
            await flush();
            observer.disconnect();
            cancelAnimationFrame(resizeFrame);
            input.dispose();
            resize.dispose();
            terminal.options.disableStdin = true;
        },
    };
}
