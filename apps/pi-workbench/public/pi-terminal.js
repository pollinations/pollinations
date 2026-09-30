import { FitAddon } from "./vendor/fit/lib/addon-fit.mjs";
import { Terminal } from "./vendor/xterm/lib/xterm.mjs";

let previous;
export function openPiTerminal(container, pty) {
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
    terminal.textarea.setAttribute("aria-label", "Real Pi terminal input");
    const input = terminal.onData((data) => {
        pty.stdin.write(data).catch(() => {});
    });
    const resize = terminal.onResize(({ cols, rows }) =>
        pty.resizeTerminal(cols, rows),
    );
    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(container);
    fit.fit();
    pty.resizeTerminal(terminal.cols, terminal.rows);
    terminal.focus();
    return {
        write: (data) =>
            new Promise((resolve) => terminal.write(data, resolve)),
        close: () => {
            observer.disconnect();
            input.dispose();
            resize.dispose();
            terminal.options.disableStdin = true;
        },
    };
}
