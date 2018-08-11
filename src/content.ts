import {Envelope, WebAudioFontPlayer} from "./WebAudioFontPlayer";
import axios from "axios";

type Note = {
    pitch: number,
    envelope: Envelope
}

const ctx = new AudioContext();
const player = new WebAudioFontPlayer();
const instruments = [];
const midiNotes: Note[] = [];
const getPageTitle = () => decodeURI(location.pathname.split("/")[2]);
let oldPageTitle: string;
let tone = instruments[getPageTitle()];

console.log("Hello from WebInstrumentExtension");

const midiNoteOn = (pitch, velocity) => {
    console.log("midiNoteOn", pitch, velocity);
    console.log("tone", tone);
    midiNoteOff(pitch);
    const envelope = player.queueWaveTable(ctx, ctx.destination, tone, 0, pitch, 123456789, velocity / 100);
    const note: Note = {
        pitch: pitch,
        envelope: envelope
    };
    midiNotes.push(note);
    console.log(envelope)
};

const midiNoteOff = (pitch) => {
    for (let i = 0; i < midiNotes.length; i++) {
        if (midiNotes[i].pitch == pitch) {
            if (midiNotes[i].envelope) {
                console.log(midiNotes[i].envelope);
                midiNotes[i].envelope.cancel();
            }
            midiNotes.splice(i, 1);
            return;
        }
    }
};

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

const getPageData = async (pageTitle: string) => {
    const res = await fetch(`https://scrapbox.io/api/pages/scrapbox-instrument/${pageTitle}`); //axios
    const {lines} = await res.json();
    return lines;
};

const generateTone = async (pageData: PageData) => {
    console.log(pageData);
    const {soundUrl, fontUrl, release} = pageData;
    let font;
    if (fontUrl !== undefined) {
        const res = await fetch(fontUrl);
        font = await res.json();
    } else if (soundUrl !== undefined) {
        font = soundfontFromSoundURL(await getDataUrlFromSoundURL(soundUrl));
    }
    if (release !== undefined) {
        for(let zone of font.zones){
            zone.release = release; //楽器変更しても継承されちゃう
        }
    }
    return font
};

const getDataUrlFromSoundURL = (url: string): Promise<string> => {
    return new Promise(async (resolve, reject) => {
        const res = await axios.get(url, {responseType: "blob"});
        console.log(res);
        const reader = new FileReader();
        reader.readAsDataURL(res.data);
        reader.onload = () => {
            console.log("onload");
            resolve(reader.result);
        };
        reader.onerror = (err) => {
            reject(err);
        }
    });
};

const soundfontFromSoundURL = (dataUrl: string) => {
    return {
        zones: [
            {
                midi: 0,						//MIDI program
                originalPitch: 6100,		    //音声データのピッチ(cent)
                keyRangeLow: 0,					//低い方のノートナンバー
                keyRangeHigh: 108,				//高い方
                loopStart: -1,					//ループ開始sec
                loopEnd: -1,					//終了sec
                coarseTune: 1,					//use fine tune
                fineTune: 0,					//tune correction in cents
                sampleRate: 44100,				//音声のサンプルレート ループでしか使ってないようなので適当でいい
                ahdsr: false,					//adsrをいじるかどうか
                delay: 0,                       //再生開始時間 とりあえずペンディング
                release: 0.1,                   //ページ内で変更可能になる
                file: dataUrl.split("data:audio/wav;base64,")[1]    //base64 APIで取れる？
            }
        ]
    }
};

type PageData = {
    soundUrl?: string,
    fontUrl?: string,
    release?: number,
    pitchHogeHoge?: boolean
}

const matcher = (lines: { text: string }[], regExp: RegExp): string | undefined => {
    for (let line of lines) {
        const matched = line.text.match(regExp);
        if (matched) {
            return matched[0]
        }
    }
    return undefined
};

const parsePage = (lines: { text: string }[]): PageData => {
    const getfontUrl = () => matcher(lines, /https\:\/\/stkay.github.io\/webaudiofontdata\/sound\/.*\.json/);
    const getSoundUrl = () => matcher(lines, /http.*\.(wav|mp3)/);
    const getReleaseTime = () => {
        const matched = matcher(lines, /release:\d+(?:\.\d+)?/);
        if (matched) {
            const str = matched.split("release:")[1];
            if (str) {
                return Number(str)
            }
        }
        return undefined
    };
    let data: PageData = {};
    data.fontUrl = getfontUrl();
    data.soundUrl = getSoundUrl();
    data.release = getReleaseTime();
    return data
};

//ページ遷移をハンドル
setInterval(async () => {
    const pageTitle = getPageTitle();
    if (pageTitle && oldPageTitle !== pageTitle) {
        console.log("change instrument");
        //wavなら
        instruments[pageTitle] = await generateTone(parsePage(await getPageData(pageTitle)));
        tone = instruments[pageTitle];
        oldPageTitle = pageTitle;
    }
}, 1000);

console.log("requestMIDIaccess");
navigator.requestMIDIAccess().then(requestMIDIAccessSuccess, requestMIDIAccessFailure);
// (async () => {
//     console.log("hi");
//     console.log(await dataUrlFromSoundURL("https://gyaon.com/sound/c6f7d4648a6120c0943e38c2edac4108.wav"));
// })();
