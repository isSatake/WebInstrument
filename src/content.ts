import * as WebAudioFontPlayer from "webaudiofont";
import * as piano from "../lib/sound/0000_Aspirin_sf2_file";

console.log(piano);
const ctx = new AudioContext();
const player = new WebAudioFontPlayer();

const tone = piano;
const when = 0;
const noteNumber = 60;
const duration = 1;
const volume = 1;

setInterval(() => {
    console.log("play!");
    player.queueWaveTable(ctx, ctx.destination, tone, when, noteNumber, duration, volume);
}, 3000);

console.log("Hello from WebInstrumentExtension");
