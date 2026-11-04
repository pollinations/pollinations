import { correction, generate, mode } from "lean-qr";
import { toSvgSource } from "lean-qr/extras/svg";
import { z } from "zod";

// SVG-only design from sunraz2 (#17818); no canvas, decoder or PNG encoder.
const levels = {
    low: correction.L,
    medium: correction.M,
    quartile: correction.Q,
    high: correction.H,
};
export const qrTools = [
    [
        "create_qr",
        "Generate a scannable QR code as SVG markup, locally. Returns the SVG text to save as a .svg file; no network or model calls.",
        {
            text: z.string().min(1).max(2953),
            error_correction: z
                .enum(["low", "medium", "quartile", "high"])
                .default("medium"),
        },
        ({ text, error_correction }) => {
            if (new TextEncoder().encode(text).length > 2953)
                throw new Error("QR input exceeds 2953 UTF-8 bytes");
            // Force UTF-8 rather than Latin-1 ECI, which common QR readers misdecode.
            const code = generate(text, {
                minCorrectionLevel: levels[error_correction],
                modes: [mode.numeric, mode.alphaNumeric, mode.ascii, mode.utf8],
            });
            return toSvgSource(code, {
                on: "black",
                off: "white",
                margin: 4,
                scale: 8,
            });
        },
    ],
];
