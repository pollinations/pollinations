import { useCallback, useEffect, useRef, useState } from "react";

const BEAT_MS = 7800;

const STORY = [
    {
        headline: "Call the API. Make a soundtrack.",
        caption:
            "A real Pollinations API request types itself. When the music is ready, it becomes the soundtrack.",
        terminal:
            'curl "https://gen.pollinations.ai/audio/90s%208-bit%20machine%20garden%20with%20a%20melody%20that%20rises%20and%20falls%2C%20bass%20entrances%20and%20dropouts?model=elevenmusic&duration=78&instrumental=true" \\\n  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \\\n  -o pollinations-theme.mp3',
        status: "calling the Pollinations audio API…",
    },
    {
        headline: "One prompt. Every medium.",
        caption:
            "Text, image and audio arrive together, with video, realtime, OCR and embeddings ready in the same system.",
        terminal: "✓ pollinations-theme.mp3 ready — playing",
        status: "text · image · audio generated together",
    },
    {
        headline: "Hundreds of models. One catalogue.",
        caption:
            "Pollinations models and community-published models meet behind the same API.",
        terminal: "$ polli models --type all",
        status: "Pollinations + community catalogue",
    },
    {
        headline: "CLI — control the whole system.",
        caption:
            "Generate, inspect models, manage keys, watch usage and check your wallet—from a terminal or an agent.",
        terminal: "$ polli balance && polli keys list && polli quests",
        status: "account remote control activated",
    },
    {
        headline: "SDK — put Pollinations in your app.",
        caption:
            "Use a typed client and React hooks for generation, authentication, wallet state and user authorization.",
        terminal: 'import { generate } from "@pollinations/sdk"',
        status: "app connected",
    },
    {
        headline: "MCP — give your assistant the tools.",
        caption:
            "Agents inside Codex, Claude Code or Cursor can generate, see, speak and check balances for themselves.",
        terminal: "$ npx @pollinations/mcp",
        status: "assistant tools connected",
    },
    {
        headline: "A quest gets you started.",
        caption:
            "Complete something useful. Quest Pollen lands in the gold pocket, ready to try models, the API and community apps.",
        terminal: "$ polli quests",
        status: "quest complete → Quest Pollen",
    },
    {
        headline: "Spend in an app. Reward its maker.",
        caption:
            "With BYOP, Pollen moves from the user's wallet through the app—and a reward reaches the developer.",
        terminal: "USER WALLET → YOUR APP → MAKER WALLET",
        status: "user spends → app delivers → maker earns",
    },
    {
        headline: "Publish a model. Earn when it is called.",
        caption:
            "A community model joins the shared catalogue. Every useful call sends a model reward back to its creator.",
        terminal: "model: maker/garden-vision",
        status: "community model live",
    },
    {
        headline: "Publish an agent. Earn when it works.",
        caption:
            "Bring your own agent, let other people call it and receive Pollen when it gets the job done.",
        terminal: "agent: maker/garden-helper",
        status: "community agent live",
    },
    {
        headline: "One open ecosystem.",
        caption:
            "The Pollinations ecosystem brings users, builders, models and agents together—and value flows back to the people making it useful.",
        terminal: "POLLINATIONS ECOSYSTEM: ONLINE",
        status: "everything grows together",
    },
] as const;

const TOTAL_MS = STORY.length * BEAT_MS;

export function ThreeWays() {
    const [phase, setPhase] = useState(0);
    const [soundOn, setSoundOn] = useState(false);
    const [reducedMotion, setReducedMotion] = useState(false);
    const [typedTerminal, setTypedTerminal] = useState("");
    const [useOriginalStory, setUseOriginalStory] = useState(false);
    const startedAt = useRef(0);
    const audioRef = useRef<HTMLAudioElement>(null);
    const keyAudioRef = useRef<AudioContext | null>(null);
    const soundOnRef = useRef(false);
    const artRoot = useOriginalStory
        ? "/characters/bee-story/generated"
        : "/characters/bee-story/nanobanana-2";
    const art = (path: string) => `${artRoot}/${path}`;
    const soundtrack = useOriginalStory
        ? "/characters/bee-story/hive-soundtrack.mp3"
        : "/characters/bee-story/machine-garden-story-78s.mp3";

    const playKeyClick = useCallback(() => {
        const context = keyAudioRef.current;
        if (!context || context.state !== "running") return;

        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const now = context.currentTime;

        oscillator.type = "square";
        oscillator.frequency.setValueAtTime(150 + Math.random() * 55, now);
        gain.gain.setValueAtTime(0.035, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + 0.028);
    }, []);

    useEffect(() => {
        setUseOriginalStory(
            new URLSearchParams(window.location.search).get("story") ===
                "original",
        );
    }, []);

    useEffect(() => {
        const motionQuery = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        );
        setReducedMotion(motionQuery.matches);

        if (motionQuery.matches) {
            setPhase(STORY.length - 1);
            return;
        }

        startedAt.current = performance.now();
        const interval = window.setInterval(() => {
            const elapsed = (performance.now() - startedAt.current) % TOTAL_MS;
            setPhase(Math.floor(elapsed / BEAT_MS));
        }, 200);

        return () => window.clearInterval(interval);
    }, []);

    useEffect(() => {
        soundOnRef.current = soundOn;
    }, [soundOn]);

    useEffect(() => {
        if (reducedMotion || phase !== 0) {
            setTypedTerminal(STORY[phase].terminal);
            return;
        }

        let index = 0;
        setTypedTerminal("");
        const typing = window.setInterval(() => {
            index += 1;
            setTypedTerminal(STORY[0].terminal.slice(0, index));
            if (soundOnRef.current) playKeyClick();
            if (index >= STORY[0].terminal.length) {
                window.clearInterval(typing);
            }
        }, 38);

        return () => window.clearInterval(typing);
    }, [phase, reducedMotion, playKeyClick]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        if (!soundOn || phase === 0) {
            audio.pause();
            return;
        }

        if (audio.paused) {
            audio.currentTime = 0;
            void audio.play().catch(() => setSoundOn(false));
        }
    }, [phase, soundOn]);

    function toggleSound() {
        const audio = audioRef.current;
        if (!audio) return;

        if (soundOn) {
            audio.pause();
            setSoundOn(false);
            return;
        }

        const context = keyAudioRef.current ?? new AudioContext();
        keyAudioRef.current = context;
        void context.resume();
        setSoundOn(true);

        if (phase > 0) {
            audio.currentTime = 0;
            void audio.play().catch(() => setSoundOn(false));
        }
    }

    return (
        <section className="flex flex-col gap-5">
            <div className="bee-story-stage" data-phase={phase}>
                <audio ref={audioRef} loop preload="metadata" src={soundtrack}>
                    <track
                        default
                        kind="captions"
                        label="English"
                        src="/characters/bee-story/hive-soundtrack.vtt"
                        srcLang="en"
                    />
                </audio>

                <button
                    type="button"
                    className="bee-story-sound"
                    aria-label={
                        soundOn
                            ? "Mute animation soundtrack"
                            : "Play animation soundtrack"
                    }
                    aria-pressed={soundOn}
                    onClick={toggleSound}
                >
                    <span aria-hidden="true">{soundOn ? "♫" : "×"}</span>
                    sound {soundOn ? "on" : "off"}
                </button>

                <div aria-hidden="true" className="bee-story-scene">
                    <div className="bee-story-terminal">
                        <div className="bee-story-terminal-bar">
                            <i />
                            <i />
                            <i />
                            <span>polli</span>
                        </div>
                        <code>{typedTerminal}</code>
                        <small>
                            {phase === 0 &&
                            typedTerminal.length === STORY[0].terminal.length
                                ? "generating pollinations-theme.mp3…"
                                : STORY[phase].status}
                        </small>
                        <div className="bee-story-cursor" />
                    </div>

                    <div className="bee-story-visual bee-story-generation">
                        <img
                            alt=""
                            src={art("multimodal/multimodal-idle.png")}
                        />
                        <img
                            alt=""
                            src={art(
                                useOriginalStory
                                    ? "multimodal/multimodal-active.png"
                                    : "multimodal/multimodal-idle.png",
                            )}
                        />
                    </div>

                    <div className="bee-story-visual bee-story-catalogue">
                        <img alt="" src={art("catalogue/catalogue-idle.png")} />
                        <img
                            alt=""
                            src={art(
                                useOriginalStory
                                    ? "catalogue/catalogue-active.png"
                                    : "catalogue/catalogue-idle.png",
                            )}
                        />
                    </div>

                    <div className="bee-story-visual bee-story-tool-focus bee-story-tool-cli">
                        <div className="bee-story-tool-art">
                            <img
                                alt=""
                                src={art(
                                    useOriginalStory
                                        ? "developer-tools/cli-idle.png"
                                        : "developer-tools/cli-polli.png",
                                )}
                            />
                            <img
                                alt=""
                                src={art(
                                    useOriginalStory
                                        ? "developer-tools/cli-active.png"
                                        : "developer-tools/cli-polli.png",
                                )}
                            />
                        </div>
                    </div>

                    <div className="bee-story-visual bee-story-tool-focus bee-story-tool-sdk">
                        <div className="bee-story-tool-art">
                            <img
                                alt=""
                                src={art(
                                    useOriginalStory
                                        ? "developer-tools/sdk-idle.png"
                                        : "developer-tools/sdk-polli.png",
                                )}
                            />
                            <img
                                alt=""
                                src={art(
                                    useOriginalStory
                                        ? "developer-tools/sdk-active.png"
                                        : "developer-tools/sdk-polli.png",
                                )}
                            />
                        </div>
                    </div>

                    <div className="bee-story-visual bee-story-tool-focus bee-story-tool-mcp">
                        <div className="bee-story-tool-art">
                            <img
                                alt=""
                                src={art(
                                    useOriginalStory
                                        ? "developer-tools/mcp-idle.png"
                                        : "developer-tools/mcp-polli.png",
                                )}
                            />
                            <img
                                alt=""
                                src={art(
                                    useOriginalStory
                                        ? "developer-tools/mcp-active.png"
                                        : "developer-tools/mcp-polli.png",
                                )}
                            />
                        </div>
                    </div>

                    <div className="bee-story-visual bee-story-quest">
                        <div className="bee-story-quest-polli-art">
                            <img
                                alt=""
                                src={art("quest/quest-polli-complete.png")}
                            />
                        </div>
                        <div className="bee-story-quest-reward-art">
                            <img
                                alt=""
                                src={art("quest/quest-pollen-coin.png")}
                            />
                        </div>
                        <div className="bee-story-quest-wallet-art">
                            <img
                                alt=""
                                src={art("quest/quest-wallet-idle.png")}
                            />
                            <img
                                alt=""
                                src={art("quest/quest-wallet-receive.png")}
                            />
                        </div>
                    </div>

                    <div className="bee-story-visual bee-story-byop">
                        <div className="bee-story-byop-character bee-story-byop-user">
                            <img
                                alt=""
                                src={art("byop/byop-user-spends.png")}
                            />
                        </div>
                        <div className="bee-story-byop-coins">
                            <img
                                alt=""
                                src={art("quest/quest-pollen-coin.png")}
                            />
                            <img alt="" src={art("byop/byop-paid-coin.png")} />
                            <img
                                alt=""
                                src={art("quest/quest-pollen-coin.png")}
                            />
                            <img alt="" src={art("byop/byop-paid-coin.png")} />
                        </div>
                        <div className="bee-story-byop-app">
                            <img alt="" src={art("byop/byop-app.png")} />
                        </div>
                        <div className="bee-story-byop-coins">
                            <img
                                alt=""
                                src={art("quest/quest-pollen-coin.png")}
                            />
                            <img alt="" src={art("byop/byop-paid-coin.png")} />
                            <img
                                alt=""
                                src={art("quest/quest-pollen-coin.png")}
                            />
                            <img alt="" src={art("byop/byop-paid-coin.png")} />
                        </div>
                        <div className="bee-story-byop-character bee-story-byop-maker">
                            <img
                                alt=""
                                src={art("byop/byop-maker-earns.png")}
                            />
                        </div>
                    </div>

                    <div className="bee-story-visual bee-story-publish bee-story-publish-model">
                        <div className="bee-story-publish-model-art">
                            <img
                                alt=""
                                src={art("publish-model/publish-model.png")}
                            />
                        </div>
                        <div className="bee-story-publish-model-call">
                            <img
                                alt=""
                                src={art("publish-model/model-called.png")}
                            />
                        </div>
                        <div className="bee-story-publish-model-coins">
                            <img
                                alt=""
                                src={art("quest/quest-pollen-coin.png")}
                            />
                            <img alt="" src={art("byop/byop-paid-coin.png")} />
                            <img
                                alt=""
                                src={art("quest/quest-pollen-coin.png")}
                            />
                            <img alt="" src={art("byop/byop-paid-coin.png")} />
                        </div>
                        <div className="bee-story-publish-wallet-art">
                            <img
                                alt=""
                                src={art("quest/quest-wallet-idle.png")}
                            />
                            <img
                                alt=""
                                src={art("quest/quest-wallet-receive.png")}
                            />
                            <img
                                alt=""
                                src={art(
                                    "publish-model/wallet-receive-paid.png",
                                )}
                            />
                        </div>
                    </div>

                    <div className="bee-story-visual bee-story-publish bee-story-publish-agent">
                        <div className="bee-story-publish-agent-art">
                            <img
                                alt=""
                                src={art("publish-agent/publish-agent.png")}
                            />
                        </div>
                        <div className="bee-story-publish-agent-work">
                            <img
                                alt=""
                                src={art("publish-agent/agent-working.png")}
                            />
                        </div>
                        <div className="bee-story-publish-agent-coins">
                            <img
                                alt=""
                                src={art("quest/quest-pollen-coin.png")}
                            />
                            <img alt="" src={art("byop/byop-paid-coin.png")} />
                            <img
                                alt=""
                                src={art("quest/quest-pollen-coin.png")}
                            />
                            <img alt="" src={art("byop/byop-paid-coin.png")} />
                        </div>
                        <div className="bee-story-publish-agent-wallet">
                            <img
                                alt=""
                                src={art("quest/quest-wallet-idle.png")}
                            />
                            <img
                                alt=""
                                src={art("quest/quest-wallet-receive.png")}
                            />
                            <img
                                alt=""
                                src={art(
                                    "publish-model/wallet-receive-paid.png",
                                )}
                            />
                        </div>
                    </div>

                    <div className="bee-story-visual bee-story-community">
                        <img alt="" src={art("community-universe.png")} />
                        <div className="bee-story-community-sparkles">
                            <i />
                            <i />
                            <i />
                            <i />
                        </div>
                    </div>

                    <div className="bee-story-sprite bee-story-polli" />
                    <div className="bee-story-sprite bee-story-robot" />
                    <div className="bee-story-sprite bee-story-nomnom" />
                </div>

                <div className="bee-story-copy" aria-live="polite">
                    <div>
                        <strong>{STORY[phase].headline}</strong>
                        <span>{STORY[phase].caption}</span>
                    </div>
                </div>

                <ol className="sr-only">
                    {STORY.map((beat) => (
                        <li key={beat.headline}>
                            {beat.headline} {beat.caption}
                        </li>
                    ))}
                </ol>
            </div>
        </section>
    );
}
