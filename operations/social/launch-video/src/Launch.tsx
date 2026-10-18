import { Audio } from "@remotion/media";
import { AbsoluteFill, Sequence, staticFile, useVideoConfig } from "remotion";
import { Grain, prog, useT, Vignette } from "./lib";
import { Community, Outro, Site } from "./scenes/Close";
import { Hero, Intro, Stats } from "./scenes/Open";
import { Api, Models, Money, Pieces } from "./scenes/Product";
import { C } from "./theme";
import T from "./timeline.json";

const SCENES = {
    intro: Intro,
    hero: Hero,
    stats: Stats,
    models: Models,
    api: Api,
    pieces: Pieces,
    money: Money,
    site: Site,
    community: Community,
    outro: Outro,
};

// Every non-drop cut lands with a quick zoom-blur, matching the whoosh.
const SceneIn: React.FC<{ skip: boolean; children: React.ReactNode }> = ({
    skip,
    children,
}) => {
    const { t } = useT();
    const p = skip ? 1 : prog(t, 0, 0.4);
    return (
        <AbsoluteFill
            style={{
                transform: `scale(${1.08 - p * 0.08})`,
                filter: p < 1 ? `blur(${(1 - p) * 14}px)` : undefined,
            }}
        >
            {children}
        </AbsoluteFill>
    );
};

export const Launch: React.FC = () => {
    const { fps } = useVideoConfig();
    return (
        <AbsoluteFill style={{ background: C.bg }}>
            {Object.entries(T.scenes).map(([name, [a, b]]) => {
                const Scene = SCENES[name as keyof typeof SCENES];
                return (
                    <Sequence
                        key={name}
                        name={name}
                        from={a * fps}
                        durationInFrames={(b - a) * fps}
                    >
                        <SceneIn skip={T.drops.includes(a)}>
                            <Scene />
                        </SceneIn>
                    </Sequence>
                );
            })}
            <Vignette />
            <Grain />
            <Audio src={staticFile("audio/soundtrack.wav")} volume={0.7} />
        </AbsoluteFill>
    );
};
