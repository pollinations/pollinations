import { writeFile } from "node:fs/promises";

const sampleRate = 44_100;

// Keep this brief beside the deterministic composition so future iterations can
// be made either by adjusting the notes below or by sending the same art direction
// to a music model.
const MUSIC_PROMPT = {
    title: "Machine Garden",
    durationSeconds: 78,
    bpm: 123.076923,
    brief: `Instrumental 1990s video-game soundtrack with a warm, botanical machine-world personality. Crisp but gentle 8-bit square-wave melody, rounded triangle-wave bass and restrained pixel percussion. Tell a complete story across ten equal scenes: sparse boot-up; discovery; confident CLI drive; airy SDK breathing space; playful MCP call-and-response; bright Quest lift; a clear BYOP bass dropout; rising model tension; full agent peak; and a broad, satisfying community resolution. Develop one memorable melody through variations, octave lifts and rests. Let the bass audibly enter, stop and return. The energy must rise and fall instead of staying constantly busy. Charming and technical, never frantic, cheesy or corporate.`,
};

function midi(note) {
    return 440 * 2 ** ((note - 69) / 12);
}

function createBuffers(length) {
    const sampleCount = Math.round(sampleRate * length);
    return {
        left: new Float32Array(sampleCount),
        right: new Float32Array(sampleCount),
    };
}

function envelope(time, length, attack = 0.008, release = 0.08) {
    return Math.min(1, time / attack, (length - time) / release);
}

function oscillator(type, phase, duty = 0.5) {
    if (type === "triangle")
        return 2 * Math.abs(2 * (phase - Math.floor(phase + 0.5))) - 1;
    return phase % 1 < duty ? 1 : -1;
}

function addTone(
    buffers,
    {
        start,
        length,
        note,
        type = "square",
        volume = 0.1,
        pan = 0,
        duty = 0.5,
        decay = 0,
    },
) {
    const first = Math.max(0, Math.floor(start * sampleRate));
    const last = Math.min(
        buffers.left.length,
        Math.floor((start + length) * sampleRate),
    );
    const frequency = midi(note);
    const leftGain = Math.sqrt((1 - pan) / 2);
    const rightGain = Math.sqrt((1 + pan) / 2);

    for (let index = first; index < last; index += 1) {
        const time = (index - first) / sampleRate;
        const env = Math.max(
            0,
            envelope(time, length) * Math.exp(-decay * time),
        );
        const value = oscillator(type, time * frequency, duty) * volume * env;
        buffers.left[index] += value * leftGain;
        buffers.right[index] += value * rightGain;
    }
}

function seededNoise(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state * 1_664_525 + 1_013_904_223) >>> 0;
        return state / 0xffff_ffff;
    };
}

function addNoise(
    buffers,
    { start, length, volume, pan = 0, seed = 1, highpass = false },
) {
    const random = seededNoise(seed);
    const first = Math.max(0, Math.floor(start * sampleRate));
    const last = Math.min(
        buffers.left.length,
        Math.floor((start + length) * sampleRate),
    );
    const leftGain = Math.sqrt((1 - pan) / 2);
    const rightGain = Math.sqrt((1 + pan) / 2);
    let previous = 0;

    for (let index = first; index < last; index += 1) {
        const time = (index - first) / sampleRate;
        const raw = random() * 2 - 1;
        const filtered = highpass ? raw - previous * 0.84 : raw;
        previous = raw;
        const value =
            filtered * volume * envelope(time, length, 0.002, length * 0.88);
        buffers.left[index] += value * leftGain;
        buffers.right[index] += value * rightGain;
    }
}

function addKick(buffers, start, volume = 0.22) {
    const length = 0.13;
    const first = Math.floor(start * sampleRate);
    const last = Math.min(
        buffers.left.length,
        Math.floor((start + length) * sampleRate),
    );
    let phase = 0;
    for (let index = first; index < last; index += 1) {
        const time = (index - first) / sampleRate;
        const frequency = 118 * Math.exp(-18 * time) + 42;
        phase += frequency / sampleRate;
        const value =
            Math.sin(phase * Math.PI * 2) * volume * Math.exp(-26 * time);
        buffers.left[index] += value * 0.71;
        buffers.right[index] += value * 0.71;
    }
}

function master(buffers, warmth = 0.18) {
    let lowLeft = 0;
    let lowRight = 0;
    for (let index = 0; index < buffers.left.length; index += 1) {
        lowLeft += warmth * (buffers.left[index] - lowLeft);
        lowRight += warmth * (buffers.right[index] - lowRight);
        buffers.left[index] = Math.tanh(lowLeft * 1.45) * 0.78;
        buffers.right[index] = Math.tanh(lowRight * 1.45) * 0.78;
    }
}

function writeWav(buffers) {
    const bytesPerSample = 2;
    const channels = 2;
    const sampleCount = buffers.left.length;
    const dataSize = sampleCount * channels * bytesPerSample;
    const output = Buffer.alloc(44 + dataSize);
    output.write("RIFF", 0);
    output.writeUInt32LE(36 + dataSize, 4);
    output.write("WAVE", 8);
    output.write("fmt ", 12);
    output.writeUInt32LE(16, 16);
    output.writeUInt16LE(1, 20);
    output.writeUInt16LE(channels, 22);
    output.writeUInt32LE(sampleRate, 24);
    output.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
    output.writeUInt16LE(channels * bytesPerSample, 32);
    output.writeUInt16LE(16, 34);
    output.write("data", 36);
    output.writeUInt32LE(dataSize, 40);

    let offset = 44;
    for (let index = 0; index < sampleCount; index += 1) {
        output.writeInt16LE(Math.round(buffers.left[index] * 32_767), offset);
        output.writeInt16LE(
            Math.round(buffers.right[index] * 32_767),
            offset + 2,
        );
        offset += 4;
    }
    return output;
}

function machineGardenStory() {
    // Ten four-bar scenes at 123.0769 BPM: 16 beats per 7.8-second visual scene.
    const totalDuration = MUSIC_PROMPT.durationSeconds;
    const beat = totalDuration / 160;
    const sectionBeats = 16;
    const buffers = createBuffers(totalDuration);

    const sections = [
        { roots: [36, 36, 39, 43], energy: 0.3, bassFrom: 8 },
        { roots: [36, 32, 39, 34], energy: 0.56 },
        { roots: [36, 36, 34, 31], energy: 0.86 },
        { roots: [39, 36, 32, 34], energy: 0.32, bassFrom: 8 },
        { roots: [41, 36, 39, 43], energy: 0.62 },
        { roots: [32, 34, 36, 39], energy: 0.72, bassBreak: [8, 12] },
        { roots: [36, 32, 34, 31], energy: 0.34, bassFrom: 10 },
        { roots: [36, 39, 41, 43], energy: 0.78 },
        { roots: [36, 34, 39, 43], energy: 1 },
        { roots: [32, 34, 36, 36], energy: 0.7, bassUntil: 13 },
    ];

    const melodies = [
        [
            60,
            null,
            null,
            63,
            null,
            null,
            67,
            null,
            63,
            null,
            null,
            60,
            null,
            null,
            null,
            null,
        ],
        [
            60,
            null,
            63,
            null,
            67,
            null,
            70,
            null,
            67,
            null,
            63,
            null,
            58,
            null,
            60,
            null,
        ],
        [
            60,
            63,
            null,
            67,
            63,
            null,
            70,
            null,
            67,
            63,
            null,
            60,
            58,
            null,
            60,
            null,
        ],
        [
            67,
            null,
            null,
            63,
            null,
            60,
            null,
            null,
            58,
            null,
            60,
            null,
            null,
            63,
            null,
            null,
        ],
        [
            65,
            null,
            68,
            null,
            null,
            72,
            null,
            68,
            67,
            null,
            70,
            null,
            null,
            74,
            null,
            70,
        ],
        [
            68,
            null,
            72,
            null,
            75,
            72,
            null,
            68,
            70,
            null,
            74,
            null,
            77,
            null,
            75,
            null,
        ],
        [
            60,
            null,
            null,
            null,
            63,
            null,
            null,
            null,
            58,
            null,
            60,
            null,
            null,
            null,
            null,
            null,
        ],
        [
            60,
            null,
            63,
            67,
            null,
            70,
            null,
            72,
            70,
            null,
            67,
            70,
            null,
            72,
            75,
            null,
        ],
        [
            72,
            75,
            null,
            79,
            75,
            null,
            82,
            null,
            79,
            75,
            null,
            72,
            70,
            72,
            75,
            null,
        ],
        [
            68,
            null,
            72,
            null,
            75,
            null,
            72,
            null,
            70,
            null,
            67,
            null,
            63,
            null,
            60,
            null,
        ],
    ];

    for (let section = 0; section < sections.length; section += 1) {
        const scene = sections[section];
        const sceneStart = section * sectionBeats * beat;

        // A two-bar melody is stated twice. The second statement answers or evolves the first.
        for (let halfStep = 0; halfStep < 32; halfStep += 1) {
            const localBeat = halfStep * 0.5;
            const note = melodies[section][halfStep % 16];
            if (note === null) continue;

            let evolvedNote = note;
            if (
                halfStep >= 16 &&
                [1, 2, 5, 7].includes(section) &&
                halfStep % 8 >= 4
            )
                evolvedNote += 12;
            if (section === 9 && halfStep >= 16)
                evolvedNote = [67, 70, 72, 75][
                    Math.floor((halfStep - 16) / 4) % 4
                ];

            addTone(buffers, {
                start: sceneStart + localBeat * beat,
                length: beat * (section === 3 || section === 9 ? 0.78 : 0.38),
                note: evolvedNote,
                volume: 0.038 + scene.energy * 0.022,
                pan:
                    section === 4
                        ? halfStep % 4 < 2
                            ? -0.48
                            : 0.48
                        : Math.sin(halfStep * 1.3) * 0.24,
                duty: section === 3 ? 0.375 : 0.25,
                decay: section === 3 || section === 9 ? 1.8 : 3.2,
            });
        }

        // Low, quiet chord pixels hold the garden together without becoming a pad-heavy soundtrack.
        for (let bar = 0; bar < 4; bar += 1) {
            const root = scene.roots[bar];
            const chord =
                section === 9 && bar >= 2
                    ? [root + 24, root + 28, root + 31]
                    : [root + 24, root + 27, root + 31];
            for (
                let chordIndex = 0;
                chordIndex < chord.length;
                chordIndex += 1
            ) {
                addTone(buffers, {
                    start: sceneStart + (bar * 4 + chordIndex * 0.5) * beat,
                    length: beat * 1.45,
                    note: chord[chordIndex],
                    volume: 0.009 + scene.energy * 0.005,
                    pan: (chordIndex - 1) * 0.35,
                    duty: 0.125,
                    decay: 1.2,
                });
            }
        }

        // Bass explicitly enters, stops, and returns so the arrangement has visible-scale motion.
        for (let localBeat = 0; localBeat < sectionBeats; localBeat += 1) {
            const afterEntrance =
                scene.bassFrom === undefined || localBeat >= scene.bassFrom;
            const beforeExit =
                scene.bassUntil === undefined || localBeat < scene.bassUntil;
            const outsideBreak =
                scene.bassBreak === undefined ||
                localBeat < scene.bassBreak[0] ||
                localBeat >= scene.bassBreak[1];
            if (!afterEntrance || !beforeExit || !outsideBreak) continue;

            const root = scene.roots[Math.floor(localBeat / 4)];
            const syncopated = section === 2 || section === 8;
            addTone(buffers, {
                start: sceneStart + localBeat * beat,
                length: beat * (syncopated ? 0.68 : 0.88),
                note: root + (syncopated && localBeat % 4 === 3 ? 7 : 0),
                type: "triangle",
                volume: 0.085 + scene.energy * 0.045,
                pan: 0,
                decay: 0.45,
            });
            if (syncopated && localBeat % 2 === 0) {
                addTone(buffers, {
                    start: sceneStart + (localBeat + 0.5) * beat,
                    length: beat * 0.28,
                    note: root + 12,
                    type: "triangle",
                    volume: 0.048,
                    decay: 1.5,
                });
            }
        }

        // Percussion follows the same arc: boot, drive, breathe, rebuild, peak, resolve.
        for (let localBeat = 0; localBeat < sectionBeats; localBeat += 0.5) {
            const wholeBeat = Number.isInteger(localBeat);
            const inQuietOpening = section === 0 && localBeat < 8;
            const inBreath = section === 3 || (section === 6 && localBeat < 10);
            const inQuestBreak =
                section === 5 && localBeat >= 8 && localBeat < 12;
            const finalTail = section === 9 && localBeat >= 13;

            if (wholeBeat && !inQuietOpening && !inQuestBreak && !finalTail) {
                const beatInBar = localBeat % 4;
                if (
                    beatInBar === 0 ||
                    (scene.energy > 0.75 && beatInBar === 2)
                ) {
                    addKick(
                        buffers,
                        sceneStart + localBeat * beat,
                        0.105 + scene.energy * 0.1,
                    );
                }
                if (beatInBar === 2 && !inBreath) {
                    addNoise(buffers, {
                        start: sceneStart + localBeat * beat,
                        length: 0.085,
                        volume: 0.025 + scene.energy * 0.025,
                        seed: 8_000 + section * 100 + localBeat * 2,
                    });
                }
            }

            if (
                !inQuietOpening &&
                !inBreath &&
                !inQuestBreak &&
                !finalTail &&
                scene.energy > 0.45
            ) {
                addNoise(buffers, {
                    start: sceneStart + localBeat * beat,
                    length: 0.018,
                    volume: 0.004 + scene.energy * 0.007,
                    pan: localBeat % 1 === 0 ? -0.24 : 0.24,
                    seed: 12_000 + section * 100 + localBeat * 2,
                    highpass: true,
                });
            }
        }

        // Small scene-change chimes make the ten chapters legible without narration.
        if (![3, 6, 9].includes(section)) {
            for (let noteIndex = 0; noteIndex < 3; noteIndex += 1) {
                addTone(buffers, {
                    start: sceneStart + (15 + noteIndex * 0.25) * beat,
                    length: beat * 0.18,
                    note: 72 + noteIndex * 3 + (section >= 7 ? 12 : 0),
                    volume: 0.024,
                    pan: (noteIndex - 1) * 0.3,
                    duty: 0.125,
                    decay: 4.5,
                });
            }
        }
    }

    // The final chord blooms after the last bass stop and lands exactly with the last frame.
    for (const [note, pan] of [
        [48, 0],
        [60, -0.35],
        [64, 0.35],
        [67, 0],
        [72, 0.15],
    ]) {
        addTone(buffers, {
            start: 74.1,
            length: 3.65,
            note,
            type: note === 48 ? "triangle" : "square",
            volume: note === 48 ? 0.09 : 0.028,
            pan,
            duty: 0.375,
            decay: 0.38,
        });
    }

    master(buffers, 0.18);
    return buffers;
}

await writeFile(
    new URL(
        "../public/characters/bee-story/machine-garden-story-78s.wav",
        import.meta.url,
    ),
    writeWav(machineGardenStory()),
);
