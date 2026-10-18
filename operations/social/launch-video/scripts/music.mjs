// Synthesizes the launch soundtrack (120 BPM, A minor → C major) from the
// shared timeline, so drops, whooshes, pops and typing ticks land exactly on
// the video's cuts. Writes public/audio/soundtrack.wav.
import { readFileSync, writeFileSync } from "node:fs";

const T = JSON.parse(
    readFileSync(new URL("../src/timeline.json", import.meta.url)),
);
const SR = 44100;
const N = Math.ceil(T.duration * SR);
const BEAT = 60 / T.bpm;
const BAR = BEAT * 4;

// Buses: drums stay dry, "music" is ducked by the kick, "send" feeds reverb.
const bus = () => [new Float32Array(N), new Float32Array(N)];
const drums = bus();
const music = bus();
const send = bus();
const duck = new Float32Array(N).fill(1);

// Deterministic noise so every render is identical.
let seed = 1234567;
const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 31 - 1;
};

const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const inRange = (t, [a, b]) => t >= a && t < b;

// RBJ biquad with coefficients recomputed on demand (for sweeps).
const biquad = (type) => {
    let b0, b1, b2, a1, a2;
    let x1 = 0,
        x2 = 0,
        y1 = 0,
        y2 = 0;
    const set = (f, q) => {
        const w = (2 * Math.PI * clamp(f, 20, SR * 0.45)) / SR;
        const c = Math.cos(w),
            al = Math.sin(w) / (2 * q);
        const a0 = 1 + al;
        if (type === "lp") {
            b0 = (1 - c) / 2;
            b1 = 1 - c;
            b2 = (1 - c) / 2;
        }
        if (type === "hp") {
            b0 = (1 + c) / 2;
            b1 = -(1 + c);
            b2 = (1 + c) / 2;
        }
        if (type === "bp") {
            b0 = al;
            b1 = 0;
            b2 = -al;
        }
        a1 = -2 * c;
        a2 = 1 - al;
        b0 /= a0;
        b1 /= a0;
        b2 /= a0;
        a1 /= a0;
        a2 /= a0;
    };
    const run = (x) => {
        const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1;
        x1 = x;
        y2 = y1;
        y1 = y;
        return y;
    };
    return { set, run };
};

const add = (b, i, l, r = l) => {
    if (i >= 0 && i < N) {
        b[0][i] += l;
        b[1][i] += r;
    }
};

// ── Drums ────────────────────────────────────────────────────────────────
const kick = (t, gain = 1) => {
    const s0 = Math.round(t * SR);
    let ph = 0;
    for (let i = 0; i < SR * 0.45; i++) {
        const tt = i / SR;
        const f = 48 + 120 * Math.exp(-tt * 38);
        ph += (2 * Math.PI * f) / SR;
        const env = Math.exp(-tt * 7.5);
        const click = i < 90 ? rnd() * 0.35 * (1 - i / 90) : 0;
        const v = (Math.tanh(Math.sin(ph) * 2.2) * env + click) * 0.9 * gain;
        add(drums, s0 + i, v);
    }
    // Sidechain: duck the music bus for ~220 ms.
    for (let i = 0; i < SR * 0.25; i++) {
        const k = s0 + i;
        if (k < N)
            duck[k] = Math.min(
                duck[k],
                0.25 + 0.75 * Math.min(1, (i / SR / 0.22) ** 1.6),
            );
    }
};

const clap = (t, gain = 1) => {
    const s0 = Math.round(t * SR);
    const bp = biquad("bp");
    bp.set(1500, 0.9);
    for (let i = 0; i < SR * 0.3; i++) {
        const tt = i / SR;
        // Three quick transients, then a tail.
        const burst = [0, 0.011, 0.022].reduce(
            (e, o) => e + (tt >= o ? Math.exp(-(tt - o) * 180) : 0),
            0,
        );
        const env = burst * 0.6 + Math.exp(-tt * 16) * 0.55;
        const v = bp.run(rnd()) * env * 1.6 * gain;
        add(drums, s0 + i, v * 0.9, v);
        add(send, s0 + i, v * 0.35);
    }
};

const hat = (t, gain = 1, open = false) => {
    const s0 = Math.round(t * SR);
    const hp = biquad("hp");
    hp.set(8000, 0.7);
    const dec = open ? 14 : 55;
    for (let i = 0; i < SR * (open ? 0.25 : 0.08); i++) {
        const v = hp.run(rnd()) * Math.exp((-i / SR) * dec) * 0.22 * gain;
        add(drums, s0 + i, v * 0.8, v);
    }
};

const crash = (t, gain = 1) => {
    const s0 = Math.round(t * SR);
    const hp = biquad("hp");
    hp.set(4500, 0.6);
    let ph = 0;
    for (let i = 0; i < SR * 2.2; i++) {
        const tt = i / SR;
        const n = hp.run(rnd()) * Math.exp(-tt * 2.2) * 0.32;
        ph += (2 * Math.PI * (42 + 30 * Math.exp(-tt * 6))) / SR;
        const boom = Math.sin(ph) * Math.exp(-tt * 2.6) * 0.75;
        add(drums, s0 + i, (n + boom) * gain, (n * 0.9 + boom) * gain);
        add(send, s0 + i, n * 0.5 * gain);
    }
};

// ── Tonal voices ─────────────────────────────────────────────────────────
const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));
const sq = (ph) => (ph % 1 < 0.5 ? 1 : -1);

const pluck = (t, note, dur, gain, cutoff, pan = 0) => {
    const s0 = Math.round(t * SR);
    const f = midi(note);
    const lp = biquad("lp");
    let ph1 = 0,
        ph2 = 0.3;
    for (let i = 0; i < SR * (dur + 0.25); i++) {
        const tt = i / SR;
        if (i % 32 === 0)
            lp.set(cutoff * (0.25 + 2.2 * Math.exp(-tt * 14)), 1.4);
        ph1 += f / SR;
        ph2 += (f * 1.004) / SR;
        const env = Math.min(1, tt / 0.003) * Math.exp(-tt * 9);
        const v = lp.run(saw(ph1) * 0.6 + sq(ph2) * 0.35) * env * gain;
        add(music, s0 + i, v * (1 - pan), v * (1 + pan));
        add(send, s0 + i, v * 0.45);
    }
};

const pad = (t, notes, dur, gain, cutoff) => {
    const s0 = Math.round(t * SR);
    for (const note of notes) {
        for (const det of [-0.11, 0, 0.12]) {
            const f = midi(note + det);
            const lp = biquad("lp");
            lp.set(cutoff, 0.7);
            let ph = rnd() + 1;
            const pan = det * 6;
            for (let i = 0; i < SR * dur; i++) {
                const tt = i / SR;
                ph += f / SR;
                const env =
                    Math.min(1, tt / 0.35) * Math.min(1, (dur - tt) / 0.4);
                const v = lp.run(saw(ph)) * env * gain;
                add(music, s0 + i, v * (1 - pan), v * (1 + pan));
                add(send, s0 + i, v * 0.6);
            }
        }
    }
};

const bass = (t, note, dur, gain) => {
    const s0 = Math.round(t * SR);
    const f = midi(note);
    const lp = biquad("lp");
    lp.set(420, 1.1);
    let ph = 0;
    for (let i = 0; i < SR * dur; i++) {
        const tt = i / SR;
        ph += f / SR;
        const env = Math.min(1, tt / 0.005) * Math.min(1, (dur - tt) / 0.03);
        const v =
            (Math.sin(2 * Math.PI * ph) * 0.8 + lp.run(saw(ph)) * 0.45) *
            env *
            gain;
        add(music, s0 + i, v);
    }
};

const lead = (t, note, dur, gain) => {
    const s0 = Math.round(t * SR);
    const lp = biquad("lp");
    lp.set(3800, 0.8);
    let ph = 0;
    for (let i = 0; i < SR * dur; i++) {
        const tt = i / SR;
        const vib =
            1 +
            0.006 * Math.sin(2 * Math.PI * 5.5 * tt) * Math.min(1, tt / 0.15);
        ph += (midi(note) * vib) / SR;
        const env =
            Math.min(1, tt / 0.004) *
            Math.exp(-tt * 2.5) *
            Math.min(1, (dur - tt) / 0.03);
        const v = lp.run(sq(ph) * 0.7 + sq(ph * 2.0) * 0.12) * env * gain;
        add(music, s0 + i, v * 0.85, v);
        add(send, s0 + i, v * 0.5);
    }
};

// ── FX ───────────────────────────────────────────────────────────────────
const riser = (t0, dur, gain = 1) => {
    const s0 = Math.round(t0 * SR);
    const bp = biquad("bp");
    let ph = 0;
    for (let i = 0; i < SR * dur; i++) {
        const p = i / (SR * dur);
        if (i % 32 === 0) bp.set(300 * 20 ** p, 2.2);
        ph += (200 * 4 ** p) / SR;
        const v =
            (bp.run(rnd()) * 0.9 + Math.sin(2 * Math.PI * ph) * 0.06) *
            p ** 2 *
            0.55 *
            gain;
        add(drums, s0 + i, v, v * 0.92);
        add(send, s0 + i, v * 0.5);
    }
};

const whoosh = (tCut, gain = 1) => {
    const dur = 0.5;
    const s0 = Math.round((tCut - dur * 0.7) * SR);
    const bp = biquad("bp");
    for (let i = 0; i < SR * dur; i++) {
        const p = i / (SR * dur);
        if (i % 32 === 0) bp.set(400 + 5200 * Math.sin(Math.PI * p) ** 2, 1.3);
        const env = Math.sin(Math.PI * p) ** 2;
        const v = bp.run(rnd()) * env * 0.42 * gain;
        // Pan sweeps left → right.
        add(drums, s0 + i, v * (1.2 - p), v * (0.2 + p));
        add(send, s0 + i, v * 0.3);
    }
};

const pop = (t, gain = 1) => {
    const s0 = Math.round(t * SR);
    let ph = 0;
    for (let i = 0; i < SR * 0.09; i++) {
        const tt = i / SR;
        ph += (700 + 1600 * Math.min(1, tt / 0.03)) / SR;
        const v = Math.sin(2 * Math.PI * ph) * Math.exp(-tt * 45) * 0.22 * gain;
        add(drums, s0 + i, v);
        add(send, s0 + i, v * 0.4);
    }
};

const tick = (t) => {
    const s0 = Math.round(t * SR);
    const hp = biquad("hp");
    hp.set(2500, 0.8);
    for (let i = 0; i < SR * 0.025; i++) {
        const v = hp.run(rnd()) * Math.exp((-i / SR) * 260) * 0.2;
        add(drums, s0 + i, v * 0.9, v);
    }
};

// ── Arrangement ──────────────────────────────────────────────────────────
const PROG = [
    { root: 45, tones: [57, 60, 64] }, // Am
    { root: 41, tones: [53, 57, 60] }, // F
    { root: 48, tones: [55, 60, 64] }, // C
    { root: 43, tones: [55, 59, 62] }, // G
];
const C_MAJOR = { root: 48, tones: [55, 60, 64] };
// Lead motif per chord (scale degrees as MIDI), played on 8ths with rests.
const MOTIF = [
    [76, null, 74, 72, null, 72, 74, null],
    [72, null, 69, null, 72, 74, 72, null],
    [76, null, 79, null, 76, 74, 72, null],
    [74, null, 71, null, 74, null, 79, null],
];

const S = T.scenes;
const [bdA, bdB] = T.breakdown;
const end = S.outro[0];
const full = (t) => t >= S.hero[0] && t < end && !inRange(t, T.breakdown);

for (let bar = 0; bar * BAR < T.duration; bar++) {
    const t0 = bar * BAR;
    const resolved = t0 >= end;
    const ch = resolved ? C_MAJOR : PROG[bar % 4];

    // Pad: whole bar, swells in the intro and the outro.
    const padCut = t0 < S.hero[0] ? 700 + t0 * 180 : resolved ? 1600 : 1300;
    const padDur = resolved ? T.duration - t0 : BAR + 0.05;
    if (!resolved || t0 === end)
        pad(t0, ch.tones, padDur, resolved ? 0.05 : 0.035, padCut);

    // Arp: 16ths up and down the chord, filter opens through the intro.
    const arpNotes = [
        ...ch.tones,
        ch.tones[0] + 12,
        ch.tones[2] + 12,
        ch.tones[1] + 12,
    ];
    const order = [0, 1, 2, 3, 4, 3, 2, 1, 0, 2, 3, 5, 4, 3, 1, 2];
    for (let s = 0; s < 16; s++) {
        const t = t0 + (s * BEAT) / 4;
        if (t >= T.duration - 1.5) break;
        let cutoff = 2600;
        let g = 0.11;
        if (t < S.hero[0]) {
            cutoff = 500 + (t / S.hero[0]) * 2600;
            g = 0.08 + 0.04 * (t / S.hero[0]);
        }
        if (inRange(t, T.breakdown))
            cutoff = 900 + ((t - bdA) / (bdB - bdA)) * 2500;
        if (t >= end) {
            g = 0.08 * Math.max(0, 1 - (t - end) / 4);
            cutoff = 2200;
        }
        if (g > 0.005)
            pluck(
                t,
                arpNotes[order[s]],
                BEAT / 4,
                g,
                cutoff,
                s % 2 ? 0.25 : -0.25,
            );
    }

    // Bass: 8th-note pulse on the root (offbeats accented) during full sections.
    for (let e = 0; e < 8; e++) {
        const t = t0 + (e * BEAT) / 2;
        if (full(t))
            bass(t, ch.root - 12 + (e % 2 ? 12 : 0), BEAT / 2 - 0.02, 0.26);
        else if (inRange(t, T.breakdown) && e % 4 === 0)
            bass(t, ch.root - 12, BEAT * 2 - 0.05, 0.18);
    }

    // Drums.
    for (let b = 0; b < 4; b++) {
        const t = t0 + b * BEAT;
        if (full(t)) {
            kick(t);
            if (b % 2 === 1) clap(t, 0.75);
            hat(t + BEAT / 2, 1, b === 3 && bar % 2 === 1);
            if (t >= S.site[0]) {
                hat(t + BEAT / 4, 0.45);
                hat(t + (3 * BEAT) / 4, 0.45);
            }
        } else if (t < S.hero[0] && t >= 2) {
            hat(t + BEAT / 2, 0.5);
        }
    }

    // Lead hook over the first and last full sections.
    const leadOn =
        inRange(t0, [S.hero[0], S.models[1]]) || inRange(t0, [S.site[0], end]);
    if (leadOn) {
        MOTIF[bar % 4].forEach((n, e) => {
            if (n !== null) lead(t0 + (e * BEAT) / 2, n, BEAT / 2 - 0.03, 0.06);
        });
    }
}

// Build-ups: riser + accelerating claps before each drop after the intro.
riser(S.hero[0] - 2, 2, 1);
riser(bdB - 2, 2, 1.1);
for (let k = 0; k < 16; k++) clap(bdB - 2 + k * 0.125, 0.25 + k * 0.035);
riser(end - 2, 2, 1.2);
for (const d of T.drops) crash(d, d === end ? 1.25 : 1);
kick(end, 1.15);

// Scene-change whooshes (skip cuts that already land on a drop).
for (const [name, [a]] of Object.entries(S)) {
    if (a > 0 && !T.drops.includes(a) && name !== "money") whoosh(a, 0.9);
}
for (const t of T.pops) pop(t);
const { start, cps } = T.typing;
const chars = T.typing.command.length;
for (let c = 0; c < chars; c++) tick(start + c / cps + rnd() * 0.008);

// ── Reverb (Freeverb-style) on the send bus ──────────────────────────────
const reverb = (inp, spread) => {
    const out = new Float32Array(N);
    const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((d) => ({
        buf: new Float32Array(d + spread),
        i: 0,
        f: 0,
    }));
    const aps = [556, 441, 341, 225].map((d) => ({
        buf: new Float32Array(d + spread),
        i: 0,
    }));
    const fb = 0.86,
        damp = 0.3;
    for (let n = 0; n < N; n++) {
        const x = inp[n] * 0.015;
        let y = 0;
        for (const c of combs) {
            const o = c.buf[c.i];
            c.f = o * (1 - damp) + c.f * damp;
            c.buf[c.i] = x + c.f * fb;
            c.i = (c.i + 1) % c.buf.length;
            y += o;
        }
        for (const a of aps) {
            const o = a.buf[a.i];
            a.buf[a.i] = y + o * 0.5;
            a.i = (a.i + 1) % a.buf.length;
            y = o - y;
        }
        out[n] = y;
    }
    return out;
};
const revL = reverb(send[0], 0);
const revR = reverb(send[1], 23);

// ── Mix + master ─────────────────────────────────────────────────────────
const L = new Float32Array(N);
const R = new Float32Array(N);
let peak = 0;
for (let i = 0; i < N; i++) {
    const t = i / SR;
    const fadeOut = Math.min(1, (T.duration - t) / 2.5);
    const l = drums[0][i] + music[0][i] * duck[i] + revL[i] * 1.6;
    const r = drums[1][i] + music[1][i] * duck[i] + revR[i] * 1.6;
    L[i] = Math.tanh(l * 1.1) * fadeOut;
    R[i] = Math.tanh(r * 1.1) * fadeOut;
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = 0.89 / peak; // ≈ -1 dBFS

const data = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
    data.writeInt16LE(Math.round(clamp(L[i] * norm, -1, 1) * 32767), i * 4);
    data.writeInt16LE(Math.round(clamp(R[i] * norm, -1, 1) * 32767), i * 4 + 2);
}
const h = Buffer.alloc(44);
h.write("RIFF", 0);
h.writeUInt32LE(36 + data.length, 4);
h.write("WAVE", 8);
h.write("fmt ", 12);
h.writeUInt32LE(16, 16);
h.writeUInt16LE(1, 20);
h.writeUInt16LE(2, 22);
h.writeUInt32LE(SR, 24);
h.writeUInt32LE(SR * 4, 28);
h.writeUInt16LE(4, 32);
h.writeUInt16LE(16, 34);
h.write("data", 36);
h.writeUInt32LE(data.length, 40);
writeFileSync(
    new URL("../public/audio/soundtrack.wav", import.meta.url),
    Buffer.concat([h, data]),
);
console.log(
    `soundtrack.wav ${T.duration}s, peak ${peak.toFixed(2)} → normalized`,
);
