import { ArrowUpRight, KeyRound } from "lucide-react";
import { AbsoluteFill, Img, interpolate, staticFile } from "remotion";
import {
    Backdrop,
    Bee,
    Browser,
    Chip,
    Eyebrow,
    Flash,
    inOut,
    mix,
    pop,
    prog,
    Rise,
    useT,
    Words,
} from "../lib";
import { C, F } from "../theme";

// ── 8. The new website: a 3D carousel through Hello, Play, Apps, Community.
const PAGES = [
    { tab: "Hello", file: "home", url: "pollinations.ai", scroll: 1500 },
    { tab: "Play", file: "play", url: "pollinations.ai/play", scroll: 520 },
    { tab: "Apps", file: "apps", url: "pollinations.ai/apps", scroll: 1700 },
    {
        tab: "Community",
        file: "community",
        url: "pollinations.ai/community",
        scroll: 1450,
    },
];
const SEG = 2;
const W = 1440;
const H = 860;

export const Site: React.FC = () => {
    const { t } = useT();
    const cur = [1, 2, 3].reduce(
        (acc, k) => acc + prog(t, k * SEG - 0.2, k * SEG + 0.45, inOut),
        0,
    );
    const enter = prog(t, 0, 0.9);
    return (
        <AbsoluteFill>
            <Backdrop glowY={55} grid={0.35} />
            {/* Site navigation, active tab follows the carousel */}
            <div
                style={{
                    position: "absolute",
                    top: 44,
                    width: "100%",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: 14,
                    opacity: enter,
                    transform: `translateY(${(1 - enter) * -40}px)`,
                }}
            >
                <Img
                    src={staticFile("brand/mark-white.png")}
                    style={{ width: 46, marginRight: 14 }}
                />
                {PAGES.map((p, k) => {
                    const on = Math.round(cur) === k;
                    return (
                        <div
                            key={p.tab}
                            style={{
                                padding: "12px 28px",
                                borderRadius: 999,
                                fontFamily: F.body,
                                fontWeight: 600,
                                fontSize: 26,
                                background: on ? C.accent : "transparent",
                                color: on ? C.brandDark : C.text,
                            }}
                        >
                            {p.tab}
                        </div>
                    );
                })}
            </div>
            <AbsoluteFill style={{ perspective: 2400 }}>
                {PAGES.map((p, k) => {
                    const rel = k - cur;
                    const a = Math.min(1, Math.abs(rel));
                    const scroll =
                        prog(t, k * SEG + 0.35, k * SEG + 2.25, inOut) *
                        p.scroll;
                    const lightWipe = k === 2 ? prog(t, 4.7, 5.4, inOut) : 0;
                    const shot = (scheme: string) => (
                        <Img
                            src={staticFile(
                                `site/${p.file}-${scheme}-full.png`,
                            )}
                            style={{
                                width: W,
                                position: "absolute",
                                top: -scroll,
                                left: 0,
                            }}
                        />
                    );
                    return (
                        <div
                            key={p.file}
                            style={{
                                position: "absolute",
                                left: 960 - W / 2,
                                top: 170,
                                zIndex: 10 - Math.round(Math.abs(rel) * 2),
                                opacity:
                                    interpolate(
                                        Math.abs(rel),
                                        [0, 1, 1.6],
                                        [1, 0.45, 0],
                                        {
                                            extrapolateRight: "clamp",
                                        },
                                    ) * enter,
                                transform: `translateX(${rel * 1180}px) translateY(${(1 - enter) * 300}px) translateZ(${-a * 420}px) rotateY(${-rel * 32}deg) rotateX(${(1 - enter) * 20}deg)`,
                            }}
                        >
                            <Browser w={W} h={H} url={p.url}>
                                {shot("dark")}
                                {lightWipe > 0 && (
                                    <div
                                        style={{
                                            position: "absolute",
                                            inset: 0,
                                            clipPath: `polygon(0 0, ${lightWipe * 160}% 0, ${lightWipe * 160 - 60}% 100%, 0 100%)`,
                                        }}
                                    >
                                        {shot("light")}
                                    </div>
                                )}
                            </Browser>
                        </div>
                    );
                })}
            </AbsoluteFill>
            <Flash t={t} at={0} max={0.7} />
        </AbsoluteFill>
    );
};

// ── 9. Community: a tilted, endlessly scrolling wall of real apps and art.
const APPS = ["02", "03", "05", "08", "10", "11", "12", "13", "15", "16"].map(
    (n) => `apps/app${n}.jpg`,
);
const ART = ["01", "02", "03", "04", "05", "06", "07", "10", "11", "12"].map(
    (n) => `ig/ig${n}.jpg`,
);
const STATS = [
    { n: "849", label: "listed apps" },
    { n: "124", label: "community models and agents" },
    { n: "6.1K", label: "PRs merged" },
    { n: "1.2K", label: "online in Discord" },
];

export const Community: React.FC = () => {
    const { t, fps } = useT();
    const cols = Array.from({ length: 7 }, (_, c) => ({
        c,
        items: Array.from({ length: 8 }, (_, r) => {
            const k = c * 3 + r;
            const id = `${c}:${r}`;
            return k % 3 === 1
                ? { id, src: ART[k % ART.length], h: 400 }
                : { id, src: APPS[k % APPS.length], h: 225 };
        }),
    }));
    return (
        <AbsoluteFill style={{ background: C.bg, overflow: "hidden" }}>
            <AbsoluteFill
                style={{
                    transform: `perspective(2200px) rotateX(24deg) rotateZ(-11deg) scale(${mix(1.35, 1.2, prog(t, 0, 6, inOut))})`,
                    transformOrigin: "50% 50%",
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        left: -480,
                        top: -700,
                        display: "flex",
                        gap: 26,
                    }}
                >
                    {cols.map(({ c, items }) => (
                        <div
                            key={`col${c}`}
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 26,
                                transform: `translateY(${(c % 2 ? -1 : 1) * t * 70 - (c % 2 ? 0 : 600) + c * 37}px)`,
                            }}
                        >
                            {items.map((it) => (
                                <Img
                                    key={it.id}
                                    src={staticFile(it.src)}
                                    style={{
                                        width: 400,
                                        height: it.h,
                                        objectFit: "cover",
                                        objectPosition: "top",
                                        borderRadius: 20,
                                        boxShadow:
                                            "0 20px 50px rgba(0,0,0,0.5)",
                                    }}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            </AbsoluteFill>
            <AbsoluteFill
                style={{
                    background:
                        "radial-gradient(ellipse 62% 58% at 50% 52%, rgba(15,14,12,0.94) 30%, rgba(15,14,12,0.55) 70%, rgba(15,14,12,0.3))",
                }}
            />
            <AbsoluteFill
                style={{
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "column",
                }}
            >
                <Rise t={t} at={0.1}>
                    <Eyebrow>Open source, open roadmap</Eyebrow>
                </Rise>
                <div
                    style={{
                        fontFamily: F.display,
                        fontSize: 112,
                        color: C.text,
                        marginTop: 18,
                        textAlign: "center",
                        lineHeight: 1,
                    }}
                >
                    <Words
                        text="Built with the community."
                        t={t}
                        at={0.15}
                        accent={["community."]}
                    />
                </div>
                <div style={{ display: "flex", gap: 64, marginTop: 80 }}>
                    {STATS.map((s, k) => {
                        const p = pop(t, 0.9 + k * 0.25, fps);
                        return (
                            <div
                                key={s.label}
                                style={{
                                    textAlign: "center",
                                    transform: `scale(${p})`,
                                    opacity: Math.min(1, p * 2),
                                }}
                            >
                                <div
                                    style={{
                                        fontFamily: F.display,
                                        fontSize: 110,
                                        color: C.accent,
                                        lineHeight: 1,
                                    }}
                                >
                                    {s.n}
                                </div>
                                <div
                                    style={{
                                        fontFamily: F.body,
                                        fontSize: 26,
                                        color: C.base,
                                        marginTop: 12,
                                        maxWidth: 260,
                                    }}
                                >
                                    {s.label}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </AbsoluteFill>
        </AbsoluteFill>
    );
};

// ── 10. Outro: lockup over the closing art, CTA, the bee lands.
export const Outro: React.FC = () => {
    const { t, fps } = useT();
    const beeP = prog(t, 0.9, 2.3, inOut);
    const fade = prog(t, 5.3, 6, (x) => x);
    return (
        <AbsoluteFill style={{ background: C.bg }}>
            <AbsoluteFill
                style={{
                    transform: `scale(${mix(1.12, 1, prog(t, 0, 6, inOut))})`,
                }}
            >
                <Img
                    src={staticFile("art/home-closing-night.webp")}
                    style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        objectPosition: "50% 70%",
                    }}
                />
            </AbsoluteFill>
            <AbsoluteFill
                style={{
                    background:
                        "radial-gradient(ellipse 60% 60% at 50% 45%, rgba(12,11,10,0.9), rgba(12,11,10,0.6) 75%, rgba(12,11,10,0.75))",
                }}
            />
            <AbsoluteFill
                style={{
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "column",
                }}
            >
                <Img
                    src={staticFile("brand/mark-white.png")}
                    style={{
                        width: 190,
                        transform: `scale(${pop(t, 0, fps, 10)})`,
                        marginTop: -60,
                    }}
                />
                <div
                    style={{
                        marginTop: 40,
                        clipPath: `inset(0 ${100 - prog(t, 0.25, 1.0) * 100}% 0 0)`,
                    }}
                >
                    <Img
                        src={staticFile("brand/wordmark-white.png")}
                        style={{ width: 860 }}
                    />
                </div>
                <div
                    style={{
                        marginTop: 44,
                        fontFamily: F.display,
                        fontSize: 60,
                        color: C.text,
                    }}
                >
                    <Words
                        text="Models. Agents. Tools. One API."
                        t={t}
                        at={0.8}
                        step={0.12}
                        accent={["API."]}
                    />
                </div>
                <Rise
                    t={t}
                    at={1.6}
                    style={{
                        marginTop: 56,
                        display: "flex",
                        gap: 24,
                        alignItems: "center",
                    }}
                >
                    <Chip
                        tone="accent"
                        style={{
                            fontSize: 32,
                            padding: "18px 36px",
                            fontWeight: 600,
                        }}
                    >
                        <KeyRound size={30} /> Get your API key
                    </Chip>
                    <Chip
                        style={{
                            fontSize: 32,
                            padding: "18px 36px",
                            background: "rgba(255,255,255,0.08)",
                            color: C.text,
                        }}
                    >
                        pollinations.ai <ArrowUpRight size={30} />
                    </Chip>
                </Rise>
            </AbsoluteFill>
            <div
                style={{
                    position: "absolute",
                    left: mix(2000, 1280, beeP),
                    top: mix(-200, 205, beeP) + Math.sin(beeP * Math.PI) * -80,
                }}
            >
                <Bee size={150} t={t} />
            </div>
            <AbsoluteFill style={{ background: "#000", opacity: fade }} />
            <Flash t={t} at={0} />
        </AbsoluteFill>
    );
};
