import type React from "react";
import {
    AbsoluteFill,
    Easing,
    Img,
    interpolate,
    random,
    spring,
    staticFile,
    useCurrentFrame,
    useVideoConfig,
} from "remotion";
import { C, F } from "./theme";

/** Scene-local time in seconds plus the absolute offset, for beat math. */
export const useT = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    return { t: frame / fps, fps, frame };
};

export const expoOut = Easing.bezier(0.16, 1, 0.3, 1);
export const inOut = Easing.bezier(0.65, 0, 0.35, 1);

/** 0→1 between seconds a and b. */
export const prog = (t: number, a: number, b: number, easing = expoOut) =>
    interpolate(t, [a, b], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing,
    });

export const pop = (t: number, at: number, fps: number, damping = 13) =>
    spring({
        frame: Math.round((t - at) * fps),
        fps,
        config: { damping, stiffness: 180, mass: 0.7 },
    });

export const mix = (a: number, b: number, p: number) => a + (b - a) * p;

/** Enter animation: rise + unblur + fade, starting at `at` seconds. */
export const Rise: React.FC<{
    t: number;
    at: number;
    dur?: number;
    y?: number;
    blur?: number;
    style?: React.CSSProperties;
    children: React.ReactNode;
}> = ({ t, at, dur = 0.7, y = 40, blur = 12, style, children }) => {
    const p = prog(t, at, at + dur);
    return (
        <div
            style={{
                opacity: prog(t, at, at + dur * 0.5),
                transform: `translateY(${(1 - p) * y}px)`,
                filter: blur ? `blur(${(1 - p) * blur}px)` : undefined,
                ...style,
            }}
        >
            {children}
        </div>
    );
};

/** Word-by-word reveal with a mask, like kinetic type in launch videos. */
export const Words: React.FC<{
    text: string;
    t: number;
    at: number;
    step?: number;
    style?: React.CSSProperties;
    accent?: string[];
}> = ({ text, t, at, step = 0.06, style, accent = [] }) => (
    <span style={{ display: "inline", ...style }}>
        {text
            .split(" ")
            .map((w, i) => ({ w, i, id: `${i}:${w}` }))
            .map(({ w, i, id }) => {
                const p = prog(t, at + i * step, at + i * step + 0.7);
                return (
                    <span
                        key={id}
                        style={{
                            display: "inline-block",
                            overflow: "hidden",
                            verticalAlign: "bottom",
                            paddingBottom: "0.08em",
                            marginBottom: "-0.08em",
                        }}
                    >
                        <span
                            style={{
                                display: "inline-block",
                                transform: `translateY(${(1 - p) * 105}%) rotate(${(1 - p) * 4}deg)`,
                                color: accent.includes(w)
                                    ? C.accent
                                    : undefined,
                            }}
                        >
                            {w}
                            {i < text.split(" ").length - 1 ? " " : ""}
                        </span>
                    </span>
                );
            })}
    </span>
);

/** Mosaic-to-sharp reveal that matches the pixel-art brand. */
export const PixelReveal: React.FC<{
    src: string;
    w: number;
    h: number;
    p: number;
    style?: React.CSSProperties;
    fit?: "cover" | "contain";
}> = ({ src, w, h, p, style, fit = "cover" }) => {
    const steps = [64, 40, 24, 14, 8, 4, 2, 1];
    const k = steps[Math.min(steps.length - 1, Math.floor(p * steps.length))];
    // Whole-pixel mosaic size, then stretch back to exactly w×h. Fractional
    // sizes get rounded by the browser and, multiplied by k, push the image
    // past the box edge, clipping its right and bottom.
    const sw = Math.max(1, Math.round(w / k));
    const sh = Math.max(1, Math.round(h / k));
    return (
        <div
            style={{
                width: w,
                height: h,
                overflow: "hidden",
                position: "relative",
                ...style,
            }}
        >
            <Img
                src={src}
                style={{
                    display: "block",
                    width: sw,
                    height: sh,
                    objectFit: fit,
                    transform: `scale(${w / sw}, ${h / sh})`,
                    transformOrigin: "top left",
                    imageRendering: k > 1 ? "pixelated" : "auto",
                    opacity: Math.min(1, p * 6),
                }}
            />
        </div>
    );
};

/** Warm desk background: glow, faint pixel grid and drifting grain. */
export const Backdrop: React.FC<{
    glow?: string;
    glowX?: number;
    glowY?: number;
    grid?: number;
}> = ({
    glow = "rgba(255,215,109,0.13)",
    glowX = 50,
    glowY = 40,
    grid = 0.5,
}) => {
    const { frame } = useT();
    return (
        <AbsoluteFill style={{ background: C.bg }}>
            <AbsoluteFill
                style={{
                    background: `radial-gradient(ellipse 60% 55% at ${glowX}% ${glowY}%, ${glow}, transparent 70%)`,
                }}
            />
            <AbsoluteFill
                style={{
                    opacity: grid,
                    backgroundImage:
                        "radial-gradient(rgba(255,255,255,0.09) 1.5px, transparent 1.6px)",
                    backgroundSize: "28px 28px",
                    backgroundPosition: `${(frame * 0.4) % 28}px 0px`,
                    maskImage:
                        "radial-gradient(ellipse 70% 70% at 50% 50%, black, transparent 85%)",
                }}
            />
        </AbsoluteFill>
    );
};

export const Grain: React.FC = () => {
    const { frame } = useT();
    const x = Math.floor(random(`gx${frame}`) * 512);
    const y = Math.floor(random(`gy${frame}`) * 512);
    return (
        <AbsoluteFill
            style={{
                backgroundImage: `url(${staticFile("noise.png")})`,
                backgroundPosition: `${x}px ${y}px`,
                opacity: 0.05,
                mixBlendMode: "overlay",
                pointerEvents: "none",
            }}
        />
    );
};

export const Vignette: React.FC<{ strength?: number }> = ({
    strength = 0.55,
}) => (
    <AbsoluteFill
        style={{
            background: `radial-gradient(ellipse 85% 80% at 50% 50%, transparent 55%, rgba(0,0,0,${strength}) 100%)`,
            pointerEvents: "none",
        }}
    />
);

/** Eyebrow label in the website's style: small caps, tracked, accent colour. */
export const Eyebrow: React.FC<{
    children: React.ReactNode;
    style?: React.CSSProperties;
}> = ({ children, style }) => (
    <div
        style={{
            fontFamily: F.body,
            fontWeight: 500,
            fontSize: 22,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: C.accentText,
            ...style,
        }}
    >
        {children}
    </div>
);

export const Chip: React.FC<{
    children: React.ReactNode;
    style?: React.CSSProperties;
    tone?: "default" | "accent" | "ghost";
}> = ({ children, style, tone = "default" }) => (
    <div
        style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 20px",
            borderRadius: 999,
            fontFamily: F.body,
            fontWeight: 500,
            fontSize: 24,
            whiteSpace: "nowrap",
            color: tone === "accent" ? C.brandDark : C.base,
            background:
                tone === "accent"
                    ? C.accent
                    : tone === "ghost"
                      ? "transparent"
                      : C.menu,
            border: tone === "ghost" ? `2px solid ${C.accent}` : undefined,
            ...style,
        }}
    >
        {children}
    </div>
);

export const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/** Rounded browser window with the site's dark chrome. */
export const Browser: React.FC<{
    w: number;
    h: number;
    url?: string;
    children: React.ReactNode;
    style?: React.CSSProperties;
}> = ({ w, h, url = "pollinations.ai", children, style }) => (
    <div
        style={{
            width: w,
            height: h,
            borderRadius: 22,
            overflow: "hidden",
            background: C.bg,
            boxShadow:
                "0 40px 120px rgba(0,0,0,0.6), 0 0 0 1.5px rgba(255,255,255,0.09)",
            display: "flex",
            flexDirection: "column",
            ...style,
        }}
    >
        <div
            style={{
                height: 52,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "0 22px",
                background: C.block,
                borderBottom: `1.5px solid ${C.divider}`,
            }}
        >
            {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
                <div
                    key={c}
                    style={{
                        width: 14,
                        height: 14,
                        borderRadius: 99,
                        background: c,
                    }}
                />
            ))}
            <div
                style={{
                    margin: "0 auto",
                    padding: "6px 60px",
                    borderRadius: 10,
                    background: C.bg,
                    color: C.muted,
                    fontFamily: F.body,
                    fontSize: 19,
                }}
            >
                {url}
            </div>
            <div style={{ width: 62 }} />
        </div>
        <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
            {children}
        </div>
    </div>
);

/** The Polli bee mascot with a little hover bob. */
export const Bee: React.FC<{
    size: number;
    t: number;
    flip?: boolean;
    style?: React.CSSProperties;
}> = ({ size, t, flip, style }) => (
    <Img
        src={staticFile("brand/polli.png")}
        style={{
            width: size,
            imageRendering: "pixelated",
            transform: `translateY(${Math.sin(t * 9) * size * 0.03}px) rotate(${Math.sin(t * 4.5) * 4}deg) scaleX(${flip ? -1 : 1})`,
            filter: "drop-shadow(0 12px 30px rgba(0,0,0,0.45))",
            ...style,
        }}
    />
);

/** A short white flash used on drops. */
export const Flash: React.FC<{
    t: number;
    at: number;
    dur?: number;
    max?: number;
}> = ({ t, at, dur = 0.35, max = 0.85 }) => {
    const o = interpolate(t, [at, at + 0.02, at + dur], [0, max, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
    });
    return (
        <AbsoluteFill
            style={{ background: "#fff8e6", opacity: o, pointerEvents: "none" }}
        />
    );
};
