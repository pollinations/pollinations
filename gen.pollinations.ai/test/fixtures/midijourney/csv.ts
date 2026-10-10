// @ts-nocheck -- Historical parser logic; only module syntax and formatting changed.
// biome-ignore-all lint: Preserve the historical parser logic, including unused variables.
// Source: https://raw.githubusercontent.com/pollinations/MIDIjourney/87768cda8c01814215cba9949633e98e8abde2ea/js/encoding/csvNotation.js
export const csvToAbleton = (csvString) => {
    console.log("converting to ableton format", csvString);
    const lines = csvString.trim().split("\n");
    const header = lines.shift().split("#")[0].split(",");

    let lastStartTime = 0;
    const notes = lines
        .map((line) => {
            let [pitch, start_time, duration, velocity] = line
                .split(",")
                .map(Number);
            if (!pitch || !duration) return null;

            if (!velocity) velocity = 100;

            velocity = Math.min(Math.max(velocity, 1), 126);

            lastStartTime = start_time;

            return {
                pitch,
                start_time,
                duration,
                velocity,
            };
        })
        .filter((note) => note !== null);

    return notes;
};
