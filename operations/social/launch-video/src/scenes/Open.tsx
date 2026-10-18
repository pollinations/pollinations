import { AbsoluteFill, Img, interpolate, random, staticFile } from "remotion";
import {
    Backdrop,
    Bee,
    Chip,
    Eyebrow,
    expoOut,
    Flash,
    fmt,
    inOut,
    mix,
    PixelReveal,
    pop,
    prog,
    Rise,
    useT,
    Words,
} from "../lib";
import { C, F } from "../theme";
import T from "../timeline.json";

// ── 1. Intro: the bee arrives, "something new is blooming", the mark resolves.
export const Intro: React.FC = () => {
    const { t, fps } = useT();
    const line = "something new is blooming";
    const typed = Math.floor(prog(t, 0.9, 2.2, (x) => x) * line.length);
    const textOut = prog(t, 2.55, 2.85);
    const beeIn = prog(t, 0, 1.6);
    const beeOut = prog(t, 2.5, 3.1, inOut);
    const markP = prog(t, 2.9, 3.9, (x) => x);
    const zoom = interpolate(t, [5.2, 6], [1, 1.9], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: inOut,
    });
    return (
        <AbsoluteFill>
            <Backdrop
                glow={`rgba(255,215,109,${0.05 + 0.12 * prog(t, 2.8, 5.5)})`}
                glowY={45}
                grid={0.6}
            />
            <AbsoluteFill
                style={{
                    transform: `scale(${zoom})`,
                    filter: `blur(${prog(t, 5.6, 6) * 8}px)`,
                }}
            >
                {/* Bee flies in on a sine path, then darts off to the top right */}
                <div
                    style={{
                        position: "absolute",
                        left: mix(-260, 820, beeIn) + beeOut * 1400,
                        top:
                            330 +
                            Math.sin(beeIn * Math.PI * 2) * 60 -
                            beeOut * 600,
                        transform: `scale(${1 - beeOut * 0.5})`,
                    }}
                >
                    <Bee size={240} t={t} />
                </div>
                {/* Pixel typewriter line */}
                <div
                    style={{
                        position: "absolute",
                        top: 640,
                        width: "100%",
                        textAlign: "center",
                        fontFamily: F.pixel,
                        fontSize: 56,
                        color: C.text,
                        letterSpacing: "0.02em",
                    }}
                >
                    {line
                        .slice(0, typed)
                        .split("")
                        .map((ch, i) => ({ ch, i, id: `c${i}` }))
                        .map(({ ch, i, id }) => (
                            <span
                                key={id}
                                style={{
                                    opacity:
                                        textOut > 0
                                            ? random(`g${i}`) > textOut
                                                ? 1
                                                : 0
                                            : 1,
                                    color:
                                        line.slice(14).includes(ch) && i >= 14
                                            ? C.accent
                                            : undefined,
                                }}
                            >
                                {ch}
                            </span>
                        ))}
                    <span
                        style={{
                            opacity:
                                textOut > 0 ? 0 : Math.floor(t * 3) % 2 ? 1 : 0,
                            color: C.accent,
                        }}
                    >
                        _
                    </span>
                </div>
                {/* Mark resolves from pixels, then the wordmark wipes in */}
                <div
                    style={{
                        position: "absolute",
                        left: 960 - 150,
                        top: 300 - prog(t, 4, 4.8) * 60,
                        transform: `scale(${0.85 + pop(t, 2.9, fps, 12) * 0.15})`,
                        opacity: markP > 0 ? 1 : 0,
                    }}
                >
                    <PixelReveal
                        src={staticFile("brand/mark-white.png")}
                        w={300}
                        h={287}
                        p={markP}
                        fit="contain"
                    />
                </div>
                <div
                    style={{
                        position: "absolute",
                        top: 640,
                        left: 960 - 400,
                        width: 800,
                        clipPath: `inset(0 ${100 - prog(t, 4.05, 4.9) * 100}% 0 0)`,
                    }}
                >
                    <Img
                        src={staticFile("brand/wordmark-white.png")}
                        style={{ width: 800 }}
                    />
                </div>
            </AbsoluteFill>
        </AbsoluteFill>
    );
};

// ── 2. Hero: four kinetic slams on the beat, then the website hero builds itself.
const SLAMS = ["Models.", "Agents.", "Tools.", "One API."];

export const Hero: React.FC = () => {
    const { t, fps } = useT();
    const i = Math.min(3, Math.floor(t / 0.5));
    const frameP = prog(t, 4.5, 5.6, inOut);
    const scale = mix(1, 0.86, frameP);
    return (
        <AbsoluteFill>
            <Backdrop glowX={30} glowY={50} />
            {t < 2 ? (
                <AbsoluteFill
                    style={{ alignItems: "center", justifyContent: "center" }}
                >
                    <div
                        style={{
                            fontFamily: F.display,
                            fontSize: i === 3 ? 300 : 330,
                            color: i === 3 ? C.accent : C.text,
                            transform: `scale(${1.35 - pop(t, i * 0.5, fps, 14) * 0.35})`,
                            filter: `blur(${(1 - prog(t, i * 0.5, i * 0.5 + 0.15)) * 14}px)`,
                            lineHeight: 1,
                        }}
                    >
                        {SLAMS[i]}
                    </div>
                </AbsoluteFill>
            ) : (
                <AbsoluteFill style={{ transform: `scale(${scale})` }}>
                    {/* Site hero rebuilt: copy left, pixel art right */}
                    <AbsoluteFill
                        style={{
                            borderRadius: frameP * 28,
                            overflow: "hidden",
                            background: C.block,
                            boxShadow: `0 0 0 ${frameP * 2}px rgba(255,255,255,0.08), 0 60px 140px rgba(0,0,0,${frameP * 0.6})`,
                        }}
                    >
                        <div
                            style={{
                                position: "absolute",
                                right: -40,
                                top: 40,
                                width: 1250,
                                height: 620,
                                transform: `scale(${mix(1.12, 1, prog(t, 2, 6, inOut))}) translateX(${(1 - prog(t, 2, 3)) * 120}px)`,
                                opacity: prog(t, 2, 2.6),
                                maskImage:
                                    "linear-gradient(to right, transparent, black 30%), linear-gradient(to top, transparent, black 25%)",
                                maskComposite: "intersect",
                            }}
                        >
                            <Img
                                src={staticFile("art/home-hero-night.webp")}
                                style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                    objectPosition: "70% 50%",
                                }}
                            />
                        </div>
                        <div
                            style={{
                                position: "absolute",
                                left: 150,
                                top: 110,
                            }}
                        >
                            <Rise t={t} at={2.0}>
                                <Eyebrow>
                                    Open infrastructure for AI-natives
                                </Eyebrow>
                            </Rise>
                            <div style={{ marginTop: 26 }}>
                                {SLAMS.map((w, k) => (
                                    <Rise
                                        key={w}
                                        t={t}
                                        at={2.0 + k * 0.08}
                                        y={90}
                                        blur={10}
                                    >
                                        <div
                                            style={{
                                                fontFamily: F.display,
                                                fontSize: 132,
                                                lineHeight: 1.04,
                                                color: C.text,
                                            }}
                                        >
                                            {w}
                                        </div>
                                    </Rise>
                                ))}
                            </div>
                            <Rise
                                t={t}
                                at={2.55}
                                style={{ marginTop: 30, width: 860 }}
                            >
                                <div
                                    style={{
                                        fontFamily: F.body,
                                        fontSize: 32,
                                        lineHeight: 1.45,
                                        color: C.base,
                                    }}
                                >
                                    The AI-native builder community. Generate
                                    images, video, speech, music and text. Build
                                    agents and apps.
                                </div>
                            </Rise>
                            <Rise
                                t={t}
                                at={2.85}
                                style={{
                                    marginTop: 34,
                                    display: "flex",
                                    gap: 26,
                                    alignItems: "center",
                                }}
                            >
                                <Chip
                                    tone="ghost"
                                    style={{
                                        fontSize: 26,
                                        padding: "14px 30px",
                                        color: C.text,
                                    }}
                                >
                                    Get an API key ↗
                                </Chip>
                                <span
                                    style={{
                                        fontFamily: F.body,
                                        fontSize: 26,
                                        color: C.accentText,
                                        textDecoration: "underline",
                                        textUnderlineOffset: 6,
                                    }}
                                >
                                    Quick start ↗
                                </span>
                            </Rise>
                        </div>
                    </AbsoluteFill>
                    {/* Browser chrome slides down as we pull back */}
                    <div
                        style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            top: -64,
                            height: 64,
                            opacity: frameP,
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            padding: "0 28px",
                        }}
                    >
                        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
                            <div
                                key={c}
                                style={{
                                    width: 16,
                                    height: 16,
                                    borderRadius: 99,
                                    background: c,
                                }}
                            />
                        ))}
                        <div
                            style={{
                                margin: "0 auto",
                                padding: "8px 90px",
                                borderRadius: 12,
                                background: C.surface,
                                color: C.muted,
                                fontFamily: F.body,
                                fontSize: 22,
                            }}
                        >
                            pollinations.ai
                        </div>
                    </div>
                </AbsoluteFill>
            )}
            <Flash t={t} at={0} />
        </AbsoluteFill>
    );
};

// ── 3. Stats: live request counter and community numbers.
const STAT_CHIPS = ["300+ models", "849 apps", "6.1K PRs merged"];

export const Stats: React.FC = () => {
    const { t, fps } = useT();
    const n = mix(0, 51950, prog(t, 0, 1.5, expoOut));
    const at0 = T.scenes.stats[0];
    return (
        <AbsoluteFill>
            <Backdrop glowY={42} />
            <AbsoluteFill
                style={{
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "column",
                }}
            >
                <div
                    style={{
                        fontFamily: F.display,
                        fontSize: 290,
                        lineHeight: 1,
                        color: C.accent,
                        transform: `scale(${0.8 + pop(t, 0, fps, 15) * 0.2})`,
                        fontVariantNumeric: "tabular-nums",
                    }}
                >
                    {fmt(n)}
                </div>
                <Rise
                    t={t}
                    at={0.15}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 18,
                        marginTop: 10,
                    }}
                >
                    <div
                        style={{
                            fontFamily: F.body,
                            fontSize: 44,
                            color: C.base,
                        }}
                    >
                        requests in the last hour
                    </div>
                    <div
                        style={{
                            width: 18,
                            height: 18,
                            borderRadius: 99,
                            background: C.live,
                            boxShadow: `0 0 0 ${6 + Math.sin(t * 8) * 5}px rgba(74,222,128,0.18)`,
                        }}
                    />
                </Rise>
                <div style={{ display: "flex", gap: 22, marginTop: 70 }}>
                    {STAT_CHIPS.map((c, k) => {
                        const s = pop(t, T.pops[12 + k] - at0, fps);
                        return (
                            <Chip
                                key={c}
                                style={{
                                    fontSize: 32,
                                    padding: "16px 34px",
                                    transform: `scale(${s})`,
                                    opacity: Math.min(1, s * 2),
                                }}
                            >
                                {c}
                            </Chip>
                        );
                    })}
                </div>
                <div
                    style={{
                        marginTop: 70,
                        fontFamily: F.serif,
                        fontSize: 64,
                        color: C.text,
                    }}
                >
                    <Words
                        text="Open source. Used by thousands of builders."
                        t={t}
                        at={1.9}
                        accent={["builders."]}
                    />
                </div>
            </AbsoluteFill>
        </AbsoluteFill>
    );
};
