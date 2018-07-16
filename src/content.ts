import * as WebAudioFontPlayer from "webaudiofont";
import * as piano from "../lib/sound/0000_Aspirin_sf2_file";

const ctx = new AudioContext();
const player = new WebAudioFontPlayer();
const tone = piano;

console.log("Hello from WebInstrumentExtension");

const midiNoteOn = (pitch, velocity) => {
    console.log("midiNoteOn", pitch, velocity);
    midiNoteOff(pitch);
    const envelope = player.queueWaveTable(ctx, ctx.destination, tone, 0, pitch, 123456789, velocity / 100);
    const note = {
        pitch: pitch,
        envelope: envelope
    };
};

const midiNoteOff = (pitch) => {};

const onMIDIStateChange = (event) => {
    const {manufacturer, name, state} = event.port;
    console.log('midiOnStateChange', event);
    console.log(`${manufacturer} ${name} ${state}`);
};

const onMIDImessage = (event) => {
    const {data} = event;
    const cmd = data[0] >> 4;
    const channel = data[0] & 0xf;
    const type = data[0] & 0xf0;
    const pitch = data[1];
    const velocity = data[2];
    switch (type) {
        case 144:
            midiNoteOn(pitch, velocity);
            break;
        case 128:
            midiNoteOff(pitch);
            break;
    }
};

//MIDIリクエスト
const requestMIDIAccessFailure = (e) => {
    console.log('failed to requestMIDIAccess', e);
};
const requestMIDIAccessSuccess = (midi) => {
    console.log("succeeded to requestMIDIAccess");
    const inputs = midi.inputs.values();
    for (let input = inputs.next(); input && !input.done; input = inputs.next()) {
        console.log('midi input', input);
        input.value.onmidimessage = onMIDImessage;
    }
    midi.onstatechange = onMIDIStateChange;
};

console.log("requestMIDIaccess");
navigator.requestMIDIAccess().then(requestMIDIAccessSuccess, requestMIDIAccessFailure);