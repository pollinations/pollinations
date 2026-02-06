#!/usr/bin/env node
// Minimal MIDI note sender - sends a single note to IAC Driver Bus 1
// Usage: ./send-midi-note.js <note> [velocity] [duration_ms]
// Example: ./send-midi-note.js 60 100 200

import easymidi from "easymidi";

const note = parseInt(process.argv[2] || 60); // Default C4
const velocity = parseInt(process.argv[3] || 100);
const duration = parseInt(process.argv[4] || 100); // ms

try {
    const output = new easymidi.Output("IAC Driver Bus 1");

    output.send("noteon", { note, velocity, channel: 0 });

    setTimeout(() => {
        output.send("noteoff", { note, velocity: 0, channel: 0 });
        output.close();
    }, duration);
} catch (err) {
    console.error("MIDI error:", err.message);
    process.exit(1);
}
