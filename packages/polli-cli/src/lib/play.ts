import { spawn, spawnSync } from "node:child_process";
import { platform } from "node:os";

type Player = { cmd: string; args: (file: string) => string[] };

const PLAYERS: Record<string, Player[]> = {
    darwin: [{ cmd: "afplay", args: (f) => [f] }],
    // Linux: mp3-capable players only. paplay/aplay are wav-only; we skip them.
    linux: [
        {
            cmd: "ffplay",
            args: (f) => ["-nodisp", "-autoexit", "-loglevel", "quiet", f],
        },
        { cmd: "mpv", args: (f) => ["--no-video", "--really-quiet", f] },
        { cmd: "mpg123", args: (f) => ["-q", f] },
    ],
    // Windows: MediaPlayer handles mp3 (SoundPlayer is wav-only).
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
                    `$deadline=(Get-Date).AddSeconds(10);` +
                    `while(-not $p.NaturalDuration.HasTimeSpan){` +
                    `if((Get-Date) -ge $deadline){throw 'Audio playback could not start'};` +
                    `Start-Sleep -Milliseconds 50};` +
                    `Start-Sleep -Seconds $p.NaturalDuration.TimeSpan.TotalSeconds`,
            ],
        },
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

/**
 * Play an audio file using the best available platform player.
 * Returns true on success, false if no player is found or playback fails.
 */
export const playAudio = async (filePath: string): Promise<boolean> => {
    const player = findPlayer();
    if (!player) return false;

    return new Promise((resolve) => {
        const child = spawn(player.cmd, player.args(filePath), {
            stdio: "ignore",
        });
        child.on("error", () => resolve(false));
        child.on("exit", (code) => resolve(code === 0));
    });
};
