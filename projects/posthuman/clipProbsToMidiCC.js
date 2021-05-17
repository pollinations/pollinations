import { readFileSync, writeFileSync } from "fs";
import tone from '@tonejs/midi';
import { flatten, last } from "ramda";

const {probabilities,words} = JSON.parse(readFileSync("./probabilities.json"));

const FPS = 10;

console.log(words, probabilities);

const midiString = readFileSync("./empty.mid");

const toneJSMidi = new tone.Midi(midiString);
// console.log("MIDI BEFORE")
// logFullObject(toneJSMidi);
const toneJSMidiJSON = toneJSMidi.toJSON()
const {ticks: lastTicks, time:lastTime} = last(toneJSMidiJSON.tracks[0].controlChanges["1"]);
const PPQ = toneJSMidiJSON.header.ppq;

const BPM = 120;


const ticksToMS = ticks => ticks* 60000 / (BPM * PPQ);

const msToTicks = ms =>  ms * BPM * PPQ / 60000;
console.log(toneJSMidiJSON.tracks[0].controlChanges)
// = Object.fromEntries(

const controlChanges = {};
probabilities.forEach((probs,frame) => {
    probs.forEach((prob, cc ) => {
        cc = cc + 1;
        const timeProp = frame / probabilities.length;
        if (!controlChanges[cc])
            controlChanges[cc] = [];
        controlChanges[cc].push({
            number: cc, 
            value: prob, 
            time: timeProp*lastTime,
            ticks: Math.floor(timeProp*lastTicks)
        });
    })
})
console.log(controlChanges);

toneJSMidiJSON.tracks[0].controlChanges = controlChanges;
console.log("lastticksoutput", JSON.stringify(last(toneJSMidiJSON.tracks[0].controlChanges["2"])))
// toneJSMidi.


toneJSMidi.fromJSON(toneJSMidiJSON);
  // console.log("MIDI AFTER")
  // logFullObject(midi);
writeFileSync("./tiergartenCCs.mid", Buffer.from(toneJSMidi.toArray()))