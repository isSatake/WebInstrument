import {WebAudioFontPlayer} from "./WebAudioFontPlayer";
import axios from "axios";
import {Font, Line, Note, PageData, Zone} from "./types";
import {keymap} from "./keymap";
import {updateSourceEl} from "./status";

const ctx = new AudioContext();
const player = new WebAudioFontPlayer();
const instruments: Font[] = [];
const midiNotes: Note[] = [];
const getPageTitle = () => decodeURI(location.pathname.split("/")[2]);
let oldPageTitle: string;
let tone: Font = instruments[getPageTitle()];
let octaveOffset: number = 5; //middle C
let doesHandlePCKey: boolean = false;

const handleKeyDown = (e) => {
    if (!doesHandlePCKey) return;
    e.preventDefault();
    const {keyCode} = e;
    if (keyCode === 38) octaveOffset++;
    if (keyCode === 40) octaveOffset--;
    const pitch = keymap[keyCode];
    if (pitch == undefined) return;
    midiNoteOn(pitch + (octaveOffset * 12), 100);
};

const midiNoteOn = (pitch, velocity) => {
    console.log("midiNoteOn:", "pitch:", pitch, "velo:", velocity);
    console.log("tone", tone);
    midiNoteOff(pitch);
    const envelope = player.queueWaveTable(ctx, ctx.destination, tone, 0, pitch, 123456789, velocity / 100);
    const note: Note = {
        pitch: pitch,
        envelope: envelope
    };
    midiNotes.push(note);
};

const midiNoteOff = (pitch) => {
    for (let i = 0; i < midiNotes.length; i++) {
        if (midiNotes[i].pitch == pitch) {
            if (midiNotes[i].envelope) {
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
const requestMIDIAccessFailure = e => console.log('failed to requestMIDIAccess', e);

const requestMIDIAccessSuccess = midi => {
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

const getDataUrlFromSoundURL = (url: string): Promise<string> => {
    return new Promise(async (resolve, reject) => {
        const res = await axios.get(url, {responseType: "blob"});
        const reader = new FileReader();
        reader.readAsDataURL(res.data);
        reader.onload = () => {
            resolve(reader.result);
        };
        reader.onerror = (err) => {
            reject(err);
        }
    });
};

const zoneTemprate: Zone = {
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
    offset: 0,                      //再生開始時間 とりあえずペンディング
    release: 0.1,                   //ページ内で変更可能になる
    file: ""                        //base64エンコードした音声ファイル
};


const strMatcher = (lines: { text: string }[], regExp: RegExp): string | undefined => {
    for (let line of lines) {
        const matched = line.text.match(regExp);
        if (matched) {
            return matched[0]
        }
    }
    return undefined
};

const parameterMatcher = (lines: { text: string }[], parameter: string): number | undefined => {
    const regExp = new RegExp(`\\[?${parameter}]?:\\d+(?:\\.\\d+)?`);
    const matched = strMatcher(lines, regExp);
    if (matched) {
        const str = matched.replace(/(\[|])/g, "").split(`${parameter}:`)[1];
        if (str) {
            return Number(str)
        }
    }
    return undefined
};

const getPageLink = (line: Line): string | undefined => {
    const matched = line.text.match(/\[(?!.*https?:\/\/[a-zA-Z0-9\-.\/?@&=:~#]+).*]/);
    if (matched) {
        const str = matched[0].replace(/(\[|])/g, "");
        if (str) return str
    }
    return undefined
};

const getFontUrl = (line: Line): string | undefined => {
    const matched = line.text.match(/https\:\/\/stkay.github.io\/webaudiofontdata\/sound\/.*\.json/);
    if (matched) return matched[0];
    return undefined;
};

const getSoundUrl = (line: Line): string | undefined => {
    const matched = line.text.match(/http.*\.(wav|mp3)/);
    if (matched) return matched[0];
    return undefined;
};

const getParameter = (line: Line, parameter: string): number | boolean | undefined => {
    const regExp = new RegExp(`\\[?${parameter}]?:\\d+(?:\\.\\d+)?`);
    const matched = line.text.match(regExp);
    if (matched) {
        const str = matched[0].replace(/(\[|])/g, "").split(`${parameter}:`)[1];
        if (str) {
            return Number(str)
        }
    }
    return undefined
};

const isEmpty = (obj: {}): boolean => {
    for (let key of Object.keys(obj)) {
        if (obj[key]) return false
    }
    return true
};

const pageParams = ["release", "offset", "track", "noteNumber"];

//音源ページでなければ空配列を返す
const parsePage = async (lines: Line[]): Promise<PageData[]> => {
    const title = lines[0].text;
    const data: PageData[] = [];
    const isSoundSet: boolean = strMatcher(lines, /#音源リスト/) !== undefined;
    let currentPageData: PageData;

    console.log("parsePage:", title, "isSoundSet:", isSoundSet);
    //lineを1行ずつパースする
    for (let line of lines) {
        //パラメーター取得
        if (currentPageData) {
            //パラメーターは連続した行に記述される
            let hasParams = false;
            for (let parameter of pageParams) {
                const value = getParameter(line, parameter);
                if (value) {
                    currentPageData[parameter] = value;
                    hasParams = true;
                }
            }
            //パラメーターが無ければpagesにpushする
            if (hasParams) continue;
            data.push(currentPageData);
            currentPageData = undefined;
        }

        //音源リストでない場合はここで終了
        if (data.length === 1 && !isSoundSet) break; //for文を中断して抜けるのはbreakだっけ？

        //font urlの場合
        const fontUrl = getFontUrl(line);
        if (fontUrl) {
            currentPageData = {
                fontUrl: fontUrl
            };
            continue;
        }

        //sound urlの場合
        const soundUrl = getSoundUrl(line);
        if (soundUrl) {
            currentPageData = {
                soundUrl: soundUrl
            };
            continue;
        }

        //ページリンクの場合
        //issue: 外部リンクは無視したい
        const link = getPageLink(line);

        if (link) {
            //リンク先にURLが記述されている？
            const _data: PageData[] = await parsePage(await getPageData(link));
            //リンク先が単体の音源でなければ無視
            if (_data.length == 1) {
                //パラメーターの取得へ
                currentPageData = _data[0];
            }
        }
    }
    console.log("parsePage:", title, "PageData[]:", data);
    return data
};

const generateZone = async (data: PageData): Promise<Zone> => {
    const {soundUrl, fontUrl, release, offset, noteNumber} = data;
    let zone: Zone;
    if (fontUrl) {
        //TODO 既存のsoundfontと音源リストと共存するのは難しいのでペンディング
    } else if (soundUrl) {
        const dataUrl = await getDataUrlFromSoundURL(soundUrl);
        const fileObj = {file: dataUrl.split("data:audio/wav;base64,")[1]};
        zone = Object.assign(zoneTemprate, fileObj);
    }
    if (release) zone.release = release;
    if (offset) zone.offset = offset;
    zone.keyRangeLow = noteNumber;
    zone.keyRangeHigh = noteNumber;
    console.log("generateZone: Zone", zone);
    return zone;
};

const generateFont = async (data: PageData[]): Promise<Font> => {
    //単体音源の場合
    if (data.length === 1) {
        console.log("generateFont: 単体音源");
        const {soundUrl, fontUrl, release, offset} = data[0];
        let font: Font;
        if (fontUrl) {
            const res = await fetch(fontUrl);
            font = await res.json();
        } else if (soundUrl) {
            const dataUrl = await getDataUrlFromSoundURL(soundUrl);
            const fileObj = {file: dataUrl.split("data:audio/wav;base64,")[1]};
            const zone = Object.assign(zoneTemprate, fileObj);
            font = {zones: [zone]}
        }
        if (release) {
            for (let zone of font.zones) {
                zone.release = release;
            }
        }
        if (offset) {
            for (let zone of font.zones) {
                zone.offset = offset;
            }
        }
        return font
    }

    //音源リストの場合
    //TODO ノートナンバーについて
    //ノートナンバーが未指定の音源リスト->60番から順にアサインする
    //1つ目の音源が70番で、2つ目が未指定なら71番に入れる
    //もし3つ目以降が71番を指定したら構わず上書きする
    //複雑なのでノートナンバーが指定されたことを想定して実装する
    console.log("generateFont: 音源リスト");
    const font: Font = {zones: []};
    for (let page of data) {
        font.zones.push(await generateZone(page));
        //TODO なぜか同じzoneがpushされてしまう
        //最後に指定した音源がpushされてるな
    }
    return font
};

//ページ遷移をハンドル
setInterval(async () => {
    const pageTitle = getPageTitle();
    if (pageTitle && oldPageTitle !== pageTitle) {
        oldPageTitle = pageTitle;
        console.log("change instrument");
        //wavなら
        const font = await generateFont(await parsePage(await getPageData(pageTitle)));
        console.log("font", font);
        instruments[pageTitle] = font;
        tone = instruments[pageTitle];
    }
}, 1000);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.message === "change_input_source")
        console.log("content_script", "received onclick event");
        changeInputSource();
});

const changeInputSource = () => {
    doesHandlePCKey = !doesHandlePCKey;
    updateSourceEl(doesHandlePCKey);
};

chrome.runtime.sendMessage({message: "WebInstrument"});
navigator.requestMIDIAccess().then(requestMIDIAccessSuccess, requestMIDIAccessFailure);
window.addEventListener("keydown", (e) => handleKeyDown(e));
updateSourceEl(doesHandlePCKey);