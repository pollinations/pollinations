import { spawn, spawnSync } from "node:child_process";
import { platform } from "node:os";
import { existsSync } from "node:fs";

type Player = { cmd: string; args: (file: string) => string[] };

const PLAYERS: Record<string, Player[]> = {
    darwin: [
        { cmd: "afplay", args: (f) => [f] },
        { cmd: "ffplay", args: (f) => ["-nodisp", "-autoexit", "-loglevel", "quiet", f] },
        { cmd: "mpv", args: (f) => ["--no-video", "--really-quiet", f] },
    ],
    linux: [
        { cmd: "ffplay", args: (f) => ["-nodisp", "-autoexit", "-loglevel", "quiet", f] },
        { cmd: "mpv", args: (f) => ["--no-video", "--really-quiet", f] },
        { cmd: "mpg123", args: (f) => ["-q", f] },
        { cmd: "aplay", args: (f) => [f] },
    ],
    win32: [
        {
            cmd: "powershell",
            args: (f) => [
                "-NoProfile",
                "-Command",
                `Add-Type -AssemblyName PresentationCore;` +
                    `$p=New-Object System.Windows.Media.MediaPlayer;` +
                    `$p.Open([uri]'${f.replace(/'/g, "''")}');` +
                    `$p.Play();` +
                    `while(-not $p.NaturalDuration.HasTimeSpan){Start-Sleep -m 50};` +
                    `Start-Sleep -Seconds $p.NaturalDuration.TimeSpan.TotalSeconds`,
            ],
        },
        { cmd: "start", args: (f) => [f] },
    ],
};

const isInstalled = (cmd: string): boolean => {
    const probe = platform() === "win32" ? "where" : "which";
    return spawnSync(probe, [cmd], { stdio: "ignore" }).status === 0;
};

const findPlayer = (): Player | null => {
    const candidates = PLAYERS[platform()] ?? [];
    return candidates.find((p) => isInstalled(p.cmd)) ?? null;
};

export const playAudio = async (
    filePath: string,
    background = false,
): Promise<boolean> => {
    if (!existsSync(filePath)) return false;
    const player = findPlayer();
    if (!player) return false;
    return new Promise((resolve) => {
        const args = player.args(filePath);
        const opts = background ? { stdio: "ignore", detached: true } : { stdio: "ignore" };
        const child = spawn(player.cmd, args, opts);
        if (background) {
            child.unref();
            resolve(true);
            return;
        }
        child.on("error", () => resolve(false));
        child.on("exit", (code) => resolve(code === 0));
    });
};

export const playerMissingHint = (): string => {
    switch (platform()) {
        case "linux":
            return "No mp3-capable player found. Install one of: ffmpeg (ffplay), mpv, mpg123, or aplay.";
        case "win32":
            return "No audio player found. PowerShell is required for playback on Windows.";
        default:
            return "No audio player found on this system.";
    }
};

export const getDefaultPlayer = (): string | null => {
    const p = findPlayer();
    return p ? p.cmd : null;
};