import {
    AudioLines,
    Bot,
    Boxes,
    CloudUpload,
    Coins,
    Gift,
    Image as ImageIcon,
    MessageSquare,
    Plug,
    ShieldCheck,
    Sparkles,
    Terminal,
    TrendingUp,
    Users,
    Video,
    Wallet,
} from "lucide-react";
import { AbsoluteFill, Img, interpolate, staticFile } from "remotion";
import {
    Backdrop,
    Chip,
    Eyebrow,
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
import { C, F, hue } from "../theme";
import T from "../timeline.json";

// ── 4. Models: the six modality cards from the home page, counting up.
const MODALITIES = [
    {
        label: "Image",
        n: 44,
        h: 350,
        Icon: ImageIcon,
        latest: "Nano Banana 2.1 · FLUX.3 Image",
    },
    {
        label: "Text",
        n: 108,
        h: 252,
        Icon: MessageSquare,
        latest: "StepFun Step 5 · Claude Haiku 5.5",
    },
    {
        label: "Audio",
        n: 41,
        h: 300,
        Icon: AudioLines,
        latest: "MAI Transcribe 2 · Qwen-Audio 3.0 TTS",
    },
    {
        label: "Video & 3D",
        n: 23,
        h: 190,
        Icon: Video,
        latest: "Grok Imagine Video 1.5 · HeyGen Video 1",
    },
    {
        label: "Embeddings",
        n: 5,
        h: 163,
        Icon: Boxes,
        latest: "Cohere Embed v4 · Qwen3 Embedding 8B",
    },
    {
        label: "Community",
        n: 87,
        h: 85,
        Icon: Users,
        latest: "Gemini 3.1 Flash-Lite · claude-opus-5-5",
    },
];
const TICKER = [
    "Nano Banana 2.1",
    "FLUX.3 Image",
    "Claude Haiku 5.5",
    "Grok Imagine Video 1.5",
    "Z-Image Turbo",
    "Lyria 3.5",
    "StepFun Step 5",
    "ElevenLabs Music v2.5",
    "HeyGen Video 1",
    "Cohere Embed v4",
    "Stable Audio 3",
    "FLUX.2 Klein",
    "Gemini 3.1 Flash-Lite",
    "Qwen-Audio 3.0 TTS",
    "MAI Transcribe 2",
];

const Ticker: React.FC<{ t: number; dir: 1 | -1; offset: number }> = ({
    t,
    dir,
    offset,
}) => {
    const items = [...TICKER.slice(offset), ...TICKER.slice(0, offset)];
    const x = ((t * 140 * dir) % 2600) - (dir > 0 ? 2600 : 0);
    return (
        <div
            style={{
                display: "flex",
                gap: 18,
                transform: `translateX(${x}px)`,
                width: 6000,
            }}
        >
            {[...items, ...items, ...items]
                .map((m, i) => ({ m, id: `${i}:${m}` }))
                .map(({ m, id }) => (
                    <Chip
                        key={id}
                        style={{
                            fontSize: 26,
                            background: C.block,
                            color: C.muted,
                        }}
                    >
                        <Sparkles size={20} color={C.accentText} />
                        {m}
                    </Chip>
                ))}
        </div>
    );
};

export const Models: React.FC = () => {
    const { t, fps } = useT();
    const at0 = T.scenes.models[0];
    const push = mix(1, 1.04, prog(t, 2, 6, inOut));
    return (
        <AbsoluteFill>
            <Backdrop glowY={20} />
            <AbsoluteFill style={{ transform: `scale(${push})` }}>
                <div style={{ position: "absolute", left: 150, top: 90 }}>
                    <Rise t={t} at={0}>
                        <Eyebrow>Models</Eyebrow>
                    </Rise>
                    <div
                        style={{
                            fontFamily: F.display,
                            fontSize: 112,
                            color: C.text,
                            marginTop: 14,
                            lineHeight: 1,
                        }}
                    >
                        <Words
                            text="300+ models. One key."
                            t={t}
                            at={0.05}
                            accent={["One", "key."]}
                        />
                    </div>
                </div>
                <div
                    style={{
                        position: "absolute",
                        left: 150,
                        top: 330,
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 520px)",
                        gap: 30,
                    }}
                >
                    {MODALITIES.map((m, k) => {
                        const at = T.pops[k] - at0;
                        const s = pop(t, at, fps);
                        const c = hue(m.h);
                        return (
                            <div
                                key={m.label}
                                style={{
                                    height: 240,
                                    borderRadius: 26,
                                    background: c.bg,
                                    boxShadow: `inset 0 0 0 1.5px ${c.edge}`,
                                    padding: "28px 32px",
                                    transform: `scale(${0.7 + s * 0.3}) translateY(${(1 - s) * 50}px)`,
                                    opacity: Math.min(1, s * 2),
                                    display: "flex",
                                    flexDirection: "column",
                                }}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 12,
                                        color: c.label,
                                    }}
                                >
                                    <m.Icon size={26} />
                                    <span
                                        style={{
                                            fontFamily: F.body,
                                            fontWeight: 600,
                                            fontSize: 24,
                                            letterSpacing: "0.1em",
                                            textTransform: "uppercase",
                                        }}
                                    >
                                        {m.label}
                                    </span>
                                </div>
                                <div
                                    style={{
                                        fontFamily: F.display,
                                        fontSize: 104,
                                        lineHeight: 1.1,
                                        color: c.num,
                                        marginTop: 6,
                                    }}
                                >
                                    {Math.round(
                                        mix(0, m.n, prog(t, at, at + 0.9)),
                                    )}
                                </div>
                                <div
                                    style={{
                                        fontFamily: F.body,
                                        fontSize: 22,
                                        color: C.muted,
                                        marginTop: "auto",
                                    }}
                                >
                                    <b
                                        style={{
                                            color: C.base,
                                            fontWeight: 600,
                                        }}
                                    >
                                        Latest:
                                    </b>{" "}
                                    {m.latest}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div
                    style={{
                        position: "absolute",
                        top: 900,
                        left: 0,
                        opacity: prog(t, 2.2, 2.8),
                        overflow: "hidden",
                        width: 1920,
                    }}
                >
                    <Ticker t={t} dir={-1} offset={0} />
                    <div style={{ height: 16 }} />
                    <Ticker t={t} dir={1} offset={7} />
                </div>
            </AbsoluteFill>
        </AbsoluteFill>
    );
};

// ── 5. One API: a terminal generates real images (made with Pollinations).
const RUNS = [
    { at: 0, cmd: T.typing.command, img: "gen/gen1.jpg" },
    {
        at: 4.0,
        cmd: 'polli gen image "glowing honey jar, macro"',
        img: "gen/gen2.jpg",
    },
    {
        at: 5.0,
        cmd: 'polli gen image "isometric honeycomb city"',
        img: "gen/gen3.jpg",
    },
    {
        at: 6.0,
        cmd: 'polli gen image "retro robot holding a plant"',
        img: "gen/gen4.jpg",
    },
];

export const Api: React.FC = () => {
    const { t, fps } = useT();
    const at0 = T.scenes.api[0];
    const typeAt = T.typing.start - at0;
    const typeEnd = typeAt + T.typing.command.length / T.typing.cps;
    const typed = T.typing.command.slice(
        0,
        Math.max(0, Math.floor((t - typeAt) * T.typing.cps)),
    );
    const first = typeEnd + 0.45;
    const run =
        t < RUNS[1].at ? 0 : t < RUNS[2].at ? 1 : t < RUNS[3].at ? 2 : 3;
    const revealAt = run === 0 ? first : RUNS[run].at;
    const lineStyle = {
        fontFamily: F.pixel,
        fontSize: 30,
        lineHeight: 1.6,
    } as const;
    return (
        <AbsoluteFill>
            <Backdrop glowX={70} glowY={55} />
            <div style={{ position: "absolute", left: 150, top: 90 }}>
                <Rise t={t} at={0}>
                    <Eyebrow>One API · npx @pollinations/cli</Eyebrow>
                </Rise>
                <div
                    style={{
                        fontFamily: F.display,
                        fontSize: 104,
                        color: C.text,
                        marginTop: 14,
                        lineHeight: 1,
                    }}
                >
                    <Words
                        text="Generate anything."
                        t={t}
                        at={0.05}
                        accent={["anything."]}
                    />
                </div>
            </div>
            {/* Terminal */}
            <Rise
                t={t}
                at={0.2}
                y={60}
                style={{ position: "absolute", left: 150, top: 340 }}
            >
                <div
                    style={{
                        width: 900,
                        height: 470,
                        borderRadius: 24,
                        background: "oklch(0.17 0.005 80)",
                        boxShadow:
                            "0 40px 100px rgba(0,0,0,0.5), inset 0 0 0 1.5px rgba(255,255,255,0.08)",
                        overflow: "hidden",
                    }}
                >
                    <div
                        style={{
                            height: 50,
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "0 22px",
                            background: C.block,
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
                                marginLeft: 16,
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                color: C.muted,
                                fontFamily: F.body,
                                fontSize: 19,
                            }}
                        >
                            <Terminal size={18} /> polli
                        </div>
                    </div>
                    <div style={{ padding: "26px 32px", color: C.text }}>
                        <div style={lineStyle}>
                            <span style={{ color: C.accent }}>❯ </span>
                            {typed}
                            {t < first && (
                                <span
                                    style={{
                                        color: C.accent,
                                        opacity:
                                            Math.floor(t * 4) % 2 ? 1 : 0.2,
                                    }}
                                >
                                    ▋
                                </span>
                            )}
                        </div>
                        {t >= typeEnd + 0.1 && (
                            <div
                                style={{
                                    ...lineStyle,
                                    color: t < first ? C.muted : C.live,
                                }}
                            >
                                {t < first
                                    ? `${"⠋⠙⠹⠸⠼⠴⠦⠧"[Math.floor(t * 20) % 8]} generating…`
                                    : "✓ image.jpg · z-image-turbo · 1024×1024"}
                            </div>
                        )}
                        {RUNS.slice(1).map(
                            (r) =>
                                t >= r.at - 0.25 && (
                                    <div
                                        key={r.at}
                                        style={{
                                            opacity: prog(
                                                t,
                                                r.at - 0.25,
                                                r.at - 0.1,
                                            ),
                                        }}
                                    >
                                        <div style={lineStyle}>
                                            <span style={{ color: C.accent }}>
                                                ❯{" "}
                                            </span>
                                            {r.cmd}
                                        </div>
                                    </div>
                                ),
                        )}
                    </div>
                </div>
            </Rise>
            <Rise
                t={t}
                at={3.0}
                y={30}
                style={{
                    position: "absolute",
                    left: 150,
                    top: 850,
                    display: "flex",
                    gap: 16,
                }}
            >
                {[
                    "Images",
                    "Video",
                    "Speech",
                    "Music",
                    "Text",
                    "Embeddings",
                ].map((m) => (
                    <Chip key={m} style={{ fontSize: 24 }}>
                        {m}
                    </Chip>
                ))}
            </Rise>
            <Rise
                t={t}
                at={3.25}
                y={30}
                style={{
                    position: "absolute",
                    left: 150,
                    top: 930,
                    fontFamily: F.pixel,
                    fontSize: 28,
                    color: C.muted,
                }}
            >
                or just a URL:{" "}
                <span style={{ color: C.accentText }}>
                    gen.pollinations.ai/image/{"{prompt}"}
                </span>
            </Rise>
            {/* Result */}
            <div
                style={{
                    position: "absolute",
                    left: 1150,
                    top: 250,
                    transform: `rotate(${mix(3, 0, pop(t, revealAt, fps))}deg) scale(${0.94 + pop(t, revealAt, fps, 11) * 0.06})`,
                    opacity: t >= first ? 1 : 0,
                }}
            >
                <div
                    style={{
                        padding: 14,
                        borderRadius: 30,
                        background: C.surface,
                        boxShadow:
                            "0 50px 120px rgba(0,0,0,0.55), inset 0 0 0 1.5px rgba(255,255,255,0.08)",
                    }}
                >
                    <PixelReveal
                        src={staticFile(RUNS[run].img)}
                        w={620}
                        h={620}
                        p={prog(t, revealAt, revealAt + 0.55, (x) => x)}
                        style={{ borderRadius: 20 }}
                    />
                </div>
                <div
                    style={{
                        marginTop: 22,
                        fontFamily: F.body,
                        fontSize: 24,
                        color: C.muted,
                        textAlign: "center",
                    }}
                >
                    Made with Pollinations · prompt {run + 1}/4
                </div>
            </div>
        </AbsoluteFill>
    );
};

// ── 6. Platform pieces: the six-tile bento from the home page.
const PIECES = [
    {
        title: "Agents",
        Icon: Bot,
        h: 300,
        tags: ["Prompt + tools", "Code", "Your own server"],
        body: "Call an agent like a model, or build your own.",
    },
    {
        title: "Hosted MCP tools",
        Icon: Plug,
        h: 190,
        tags: ["FFmpeg", "Exa Search", "Computer"],
        body: "A private computer, web search and connected apps.",
    },
    {
        title: "Pollinations CLI",
        Icon: Terminal,
        h: 252,
        tags: ["npx @pollinations/cli"],
        body: "For humans, AI agents and everything in between.",
    },
    {
        title: "Users pay",
        Icon: Wallet,
        h: 85,
        tags: ["BYOP", "Earnings"],
        body: "Users sign in and pay for their own usage.",
    },
    {
        title: "Media storage",
        Icon: CloudUpload,
        h: 350,
        tags: ["Images", "Audio", "Video"],
        body: "Upload files to get a link for model calls.",
    },
    {
        title: "Safety checks",
        Icon: ShieldCheck,
        h: 163,
        tags: ["Privacy", "Secrets", "NSFW"],
        body: "Block unsafe prompts before they reach the model.",
    },
];

export const Pieces: React.FC = () => {
    const { t, fps } = useT();
    const at0 = T.scenes.pieces[0];
    // One tile per beat from 3s, ending on the cut — each lights once.
    const active = t >= 3 ? Math.min(5, Math.floor((t - 3) / 0.5)) : -1;
    const tilt = mix(14, 0, prog(t, 0, 2.5, inOut));
    return (
        <AbsoluteFill>
            <Backdrop glowY={60} />
            <div style={{ position: "absolute", left: 150, top: 90 }}>
                <div
                    style={{
                        fontFamily: F.serif,
                        fontSize: 92,
                        color: C.text,
                        lineHeight: 1.05,
                    }}
                >
                    <Words text="Pick the pieces you need." t={t} at={0} />
                </div>
                <Rise
                    t={t}
                    at={0.25}
                    style={{
                        fontFamily: F.body,
                        fontSize: 32,
                        color: C.muted,
                        marginTop: 16,
                    }}
                >
                    Agents and hosted tools, plus storage, billing and safety.
                </Rise>
            </div>
            <div
                style={{
                    position: "absolute",
                    left: 150,
                    top: 340,
                    perspective: 1800,
                }}
            >
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 520px)",
                        gap: 30,
                        transform: `rotateX(${tilt}deg)`,
                        transformOrigin: "50% 0%",
                    }}
                >
                    {PIECES.map((p, k) => {
                        const s = pop(t, T.pops[6 + k] - at0, fps);
                        const on = active === k;
                        const c = hue(p.h);
                        return (
                            <div
                                key={p.title}
                                style={{
                                    height: 300,
                                    borderRadius: 26,
                                    padding: 32,
                                    background: C.block,
                                    boxShadow: on
                                        ? `inset 0 0 0 2px ${C.accent}, 0 30px 80px rgba(255,215,109,0.18)`
                                        : "inset 0 0 0 1.5px rgba(255,255,255,0.06)",
                                    transform: `scale(${0.7 + s * 0.3}) translateY(${(1 - s) * 60 - (on ? 10 : 0)}px)`,
                                    opacity: Math.min(1, s * 2),
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 18,
                                }}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 18,
                                    }}
                                >
                                    <div
                                        style={{
                                            width: 60,
                                            height: 60,
                                            borderRadius: 16,
                                            background: c.bg,
                                            color: c.num,
                                            display: "grid",
                                            placeItems: "center",
                                        }}
                                    >
                                        <p.Icon size={32} />
                                    </div>
                                    <div
                                        style={{
                                            fontFamily: F.serif,
                                            fontSize: 36,
                                            color: C.text,
                                        }}
                                    >
                                        {p.title}
                                    </div>
                                </div>
                                <div
                                    style={{
                                        display: "flex",
                                        gap: 10,
                                        flexWrap: "wrap",
                                    }}
                                >
                                    {p.tags.map((tag) => (
                                        <Chip
                                            key={tag}
                                            style={{
                                                fontSize: 20,
                                                padding: "7px 16px",
                                                background: C.surface,
                                            }}
                                        >
                                            {tag}
                                        </Chip>
                                    ))}
                                </div>
                                <div
                                    style={{
                                        fontFamily: F.body,
                                        fontSize: 24,
                                        lineHeight: 1.4,
                                        color: C.base,
                                    }}
                                >
                                    {p.body}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </AbsoluteFill>
    );
};

// ── 7. One credit: pricing, Quest pollen and earnings (the breakdown).
const ROWS = [
    {
        Icon: Wallet,
        title: "Pay as you go",
        body: "Top up any time and pay only for what you use.",
        h: 85,
    },
    { Icon: Gift, title: "Free credits", body: "", h: 140 },
    {
        Icon: TrendingUp,
        title: "Earnings",
        body: "Get a share of what others spend on your models and apps.",
        h: 252,
    },
];

export const Money: React.FC = () => {
    const { t, fps } = useT();
    const at0 = T.scenes.money[0];
    const out = prog(t, 3.7, 4.2, inOut);
    const finale = prog(t, 4.1, 6, (x) => x);
    return (
        <AbsoluteFill>
            <Backdrop glowX={70} glowY={60} glow="rgba(255,190,90,0.12)" />
            <AbsoluteFill
                style={{
                    opacity: 1 - out,
                    transform: `scale(${1 - out * 0.06})`,
                    filter: `blur(${out * 10}px)`,
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        right: 0,
                        top: 120,
                        width: 1100,
                        height: 860,
                        opacity: prog(t, 0, 1.2),
                        transform: `scale(${mix(1.08, 1, prog(t, 0, 4, inOut))})`,
                        maskImage:
                            "linear-gradient(to right, transparent, black 35%)",
                    }}
                >
                    <Img
                        src={staticFile("art/home-quests-night.webp")}
                        style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            objectPosition: "65% 50%",
                        }}
                    />
                </div>
                <div
                    style={{
                        position: "absolute",
                        left: 150,
                        top: 110,
                        width: 900,
                    }}
                >
                    <div
                        style={{
                            fontFamily: F.serif,
                            fontSize: 84,
                            color: C.text,
                            lineHeight: 1.08,
                        }}
                    >
                        <Words
                            text="One credit for every model, agent and tool."
                            t={t}
                            at={0.05}
                        />
                    </div>
                    <div
                        style={{
                            marginTop: 34,
                            transform: `scale(${pop(t, 0.6, fps, 10)})`,
                            transformOrigin: "left center",
                        }}
                    >
                        <Chip
                            tone="accent"
                            style={{
                                fontSize: 40,
                                padding: "16px 34px",
                                fontWeight: 600,
                            }}
                        >
                            <Coins size={36} /> 1 pollen = $1
                        </Chip>
                    </div>
                    <div
                        style={{
                            marginTop: 50,
                            display: "flex",
                            flexDirection: "column",
                            gap: 34,
                        }}
                    >
                        {ROWS.map((r, k) => {
                            const at = T.pops[15 + k] - at0;
                            const c = hue(r.h);
                            return (
                                <Rise
                                    key={r.title}
                                    t={t}
                                    at={at}
                                    y={30}
                                    style={{ display: "flex", gap: 24 }}
                                >
                                    <div
                                        style={{
                                            width: 64,
                                            height: 64,
                                            flexShrink: 0,
                                            borderRadius: 18,
                                            background: c.bg,
                                            color: c.num,
                                            display: "grid",
                                            placeItems: "center",
                                        }}
                                    >
                                        <r.Icon size={32} />
                                    </div>
                                    <div>
                                        <div
                                            style={{
                                                fontFamily: F.serif,
                                                fontSize: 38,
                                                color: C.text,
                                            }}
                                        >
                                            {r.title}
                                        </div>
                                        <div
                                            style={{
                                                fontFamily: F.body,
                                                fontSize: 27,
                                                color: C.base,
                                                marginTop: 6,
                                                lineHeight: 1.4,
                                                maxWidth: 640,
                                            }}
                                        >
                                            {r.body || (
                                                <>
                                                    <b
                                                        style={{
                                                            color: C.accentText,
                                                        }}
                                                    >
                                                        {fmt(
                                                            mix(
                                                                0,
                                                                39904,
                                                                prog(
                                                                    t,
                                                                    at,
                                                                    at + 1.4,
                                                                ),
                                                            ),
                                                        )}
                                                    </b>{" "}
                                                    builders earned{" "}
                                                    <b
                                                        style={{
                                                            color: C.accentText,
                                                        }}
                                                    >
                                                        {fmt(
                                                            mix(
                                                                0,
                                                                45372,
                                                                prog(
                                                                    t,
                                                                    at,
                                                                    at + 1.4,
                                                                ),
                                                            ),
                                                        )}
                                                    </b>{" "}
                                                    pollen from GitHub Quests.
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </Rise>
                            );
                        })}
                    </div>
                </div>
            </AbsoluteFill>
            {/* Build into the site reveal */}
            <AbsoluteFill
                style={{
                    alignItems: "center",
                    justifyContent: "center",
                    transform: `scale(${interpolate(finale, [0, 1], [0.92, 1.25])})`,
                    opacity: t > 4.1 ? 1 : 0,
                }}
            >
                <div
                    style={{
                        fontFamily: F.display,
                        fontSize: 150,
                        color: C.text,
                        textAlign: "center",
                        lineHeight: 1.05,
                    }}
                >
                    <Words
                        text="And a brand new home."
                        t={t}
                        at={4.15}
                        step={0.1}
                        accent={["new"]}
                    />
                </div>
            </AbsoluteFill>
        </AbsoluteFill>
    );
};
