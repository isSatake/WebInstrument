export type Envelope = {
    target,
    cancel: () => void,
    when,
    duration,
    pitch,
    preset,
    audioBufferSourceNode
} & GainNode

export type Zone = {
    loopStart: number,
    loopEnd: number,
    coarseTune: number,
    fineTune: number,
    originalPitch: number,
    sampleRate: number,
    sustain: number,
    delay,
    release?: number,
    file?: string,
    buffer?: any
}

export class WebAudioFontPlayer {
    private envelopes: Envelope[] = [];
    private onCacheFinish = null;
    private onCacheProgress = null;
    private readonly afterTime = 0.05;
    private readonly nearZero = 0.000001;

    constructor() {
        return this;
    }

    limitVolume = (volume): number => {
        if (volume) {
            volume = 1.0 * volume;
        } else {
            volume = 0.5;
        }
        return volume;
    };

    // this.queueChord = function (audioContext, target, preset, when, pitches, duration, volume, slides) {
    //   volume = this.limitVolume(volume);
    //   for (var i = 0; i < pitches.length; i++) {
    //     this.queueWaveTable(audioContext, target, preset, when, pitches[i], duration, volume - Math.random() * 0.01, slides);
    //   }
    // };
    // this.queueStrumUp = function (audioContext, target, preset, when, pitches, duration, volume, slides) {
    //   pitches.sort(function (a, b) {
    //     return b - a;
    //   });
    //   this.queueStrum(audioContext, target, preset, when, pitches, duration, volume, slides);
    // };
    // this.queueStrumDown = function (audioContext, target, preset, when, pitches, duration, volume, slides) {
    //   pitches.sort(function (a, b) {
    //     return a - b;
    //   });
    //   this.queueStrum(audioContext, target, preset, when, pitches, duration, volume, slides);
    // };
    // this.queueStrum = function (audioContext, target, preset, when, pitches, duration, volume, slides) {
    //   volume = this.limitVolume(volume);
    //   if (when < audioContext.currentTime) {
    //     when = audioContext.currentTime;
    //   }
    //   for (var i = 0; i < pitches.length; i++) {
    //     this.queueWaveTable(audioContext, target, preset, when + i * 0.01, pitches[i], duration, volume - Math.random() * 0.01, slides);
    //     volume = 0.9 * volume;
    //   }
    // };
    // this.queueSnap = function (audioContext, target, preset, when, pitches, duration, volume, slides) {
    //   volume = this.limitVolume(volume);
    //   volume = 1.5 * (volume || 1.0);z
    //   duration = 0.05;
    //   this.queueChord(audioContext, target, preset, when, pitches, duration, volume, slides);
    // };

    public queueWaveTable = (audioContext: AudioContext, target, preset, when, pitch, duration, volume, slides?) => {
        if (audioContext.state === 'suspended') {
            console.log('audioContext.resume');
            audioContext.resume();
        }

        volume = this.limitVolume(volume);

        const zone: Zone = this.findZone(audioContext, preset, pitch);
        if (!(zone.buffer)) {
            console.log('empty buffer ', zone);
            return;
        }

        const baseDetune = zone.originalPitch - 100.0 * zone.coarseTune - zone.fineTune;
        const playbackRate = Math.pow(2, (100.0 * pitch - baseDetune) / 1200.0);
        const sampleRatio = zone.sampleRate / audioContext.sampleRate;
        let startWhen = when;
        if (startWhen < audioContext.currentTime) {
            startWhen = audioContext.currentTime;
        }
        let waveDuration = duration + this.afterTime;
        let loop = true;
        if (zone.loopStart < 1 || zone.loopStart >= zone.loopEnd) {
            loop = false;
        }
        if (!loop) {
            if (waveDuration > zone.buffer.duration / playbackRate) {
                waveDuration = zone.buffer.duration / playbackRate;
            }
        }

        console.log(`WebAudioFontPlayer.js: queueWaveTable() releaseTime: ${zone.release}`);
        const envelope = this.findEnvelope(audioContext, target, startWhen, waveDuration, zone.release);
        this.setupEnvelope(audioContext, envelope, zone, volume, startWhen, waveDuration, duration);
        envelope.audioBufferSourceNode = audioContext.createBufferSource();
        envelope.audioBufferSourceNode.playbackRate.setValueAtTime(playbackRate, 0);

        if (slides) {
            if (slides.length > 0) {
                envelope.audioBufferSourceNode.playbackRate.setValueAtTime(playbackRate, when);
                for (let i = 0; i < slides.length; i++) {
                    const newPlaybackRate = Math.pow(2, (100.0 * slides[i].pitch - baseDetune) / 1200.0);
                    const newWhen = when + slides[i].when;
                    envelope.audioBufferSourceNode.playbackRate.linearRampToValueAtTime(newPlaybackRate, newWhen);
                }
            }
        }

        envelope.audioBufferSourceNode.buffer = zone.buffer;
        if (loop) {
            envelope.audioBufferSourceNode.loop = true;
            envelope.audioBufferSourceNode.loopStart = zone.loopStart / zone.sampleRate;
            envelope.audioBufferSourceNode.loopEnd = zone.loopEnd / zone.sampleRate;
        } else {
            envelope.audioBufferSourceNode.loop = false;
        }

        envelope.audioBufferSourceNode.connect(envelope);
        envelope.audioBufferSourceNode.start(startWhen, zone.delay);
        envelope.audioBufferSourceNode.stop(startWhen + waveDuration);
        envelope.when = startWhen;
        envelope.duration = waveDuration;
        envelope.pitch = pitch;
        envelope.preset = preset;
        return envelope;
    };

    noZeroVolume = (n): number => {
        if (n > this.nearZero) {
            return n;
        } else {
            return this.nearZero;
        }
    };

    setupEnvelope = (audioContext, envelope, zone, volume, when, sampleDuration, noteDuration) => {
        envelope.gain.setValueAtTime(this.noZeroVolume(0), audioContext.currentTime);
        let lastTime = 0;
        let lastVolume = 0;
        let duration = noteDuration;
        let ahdsr = zone.ahdsr;
        if (sampleDuration < duration + this.afterTime) {
            duration = sampleDuration - this.afterTime;
        }
        if (ahdsr) {
            if (!(ahdsr.length > 0)) {
                ahdsr = [{
                    duration: 0,
                    volume: 1
                }, {
                    duration: 0.5,
                    volume: 1
                }, {
                    duration: 1.5,
                    volume: 0.5
                }, {
                    duration: 3,
                    volume: 0
                }
                ];
            }
        } else {
            ahdsr = [{
                duration: 0,
                volume: 1
            }, {
                duration: duration,
                volume: 1
            }
            ];
        }
        envelope.gain.cancelScheduledValues(when);
        envelope.gain.setValueAtTime(this.noZeroVolume(ahdsr[0].volume * volume), when);
        for (let i = 0; i < ahdsr.length; i++) {
            if (ahdsr[i].duration > 0) {
                if (ahdsr[i].duration + lastTime > duration) {
                    const r = 1 - (ahdsr[i].duration + lastTime - duration) / ahdsr[i].duration;
                    const n = lastVolume - r * (lastVolume - ahdsr[i].volume);
                    envelope.gain.linearRampToValueAtTime(this.noZeroVolume(volume * n), when + duration);
                    break;
                }
                lastTime = lastTime + ahdsr[i].duration;
                lastVolume = ahdsr[i].volume;
                envelope.gain.linearRampToValueAtTime(this.noZeroVolume(volume * lastVolume), when + lastTime);
            }
        }
        envelope.gain.linearRampToValueAtTime(this.noZeroVolume(0), when + duration + this.afterTime);
    };

    numValue = (aValue: any, defValue: number): number => {
        if (typeof aValue === "number") {
            return aValue;
        } else {
            return defValue;
        }
    };

    findEnvelope = (audioContext, target, when, duration, releaseTime = 0.1): Envelope => {
        console.log(`WebAudioFontPlayer.js: findEnvelope() releaseTime: ${releaseTime}`);
        let envelope: Envelope = null;
        for (let e of this.envelopes) {
            if (e.target == target && audioContext.currentTime > e.when + e.duration + 0.001) {
                try {
                    e.audioBufferSourceNode.disconnect();
                    e.audioBufferSourceNode.stop(0);
                    e.audioBufferSourceNode = null;
                } catch (x) {
                    //audioBufferSourceNode is dead already
                }
                envelope = e;
                break;
            }
        }

        if (!(envelope)) {
            envelope = audioContext.createGain();
            envelope.target = target;
            envelope.connect(target);
            envelope.cancel = () => {
                if (envelope.when + envelope.duration > audioContext.currentTime) {
                    console.log(`WebAudioFontPlayer.js: cancel() releaseTime: ${releaseTime}`);
                    envelope.gain.cancelScheduledValues(0);
                    envelope.gain.setTargetAtTime(0.00001, audioContext.currentTime, releaseTime);
                    envelope.when = audioContext.currentTime + 0.00001;
                    envelope.duration = 0;
                }
            };
            this.envelopes.push(envelope);
        }
        return envelope;
    };

    adjustPreset = (audioContext, preset) => {
        for (let i = 0; i < preset.zones.length; i++) {
            this.adjustZone(audioContext, preset.zones[i]);
        }
    };

    //鳴らしたい音の"zone"を生成
    adjustZone = (audioContext, zone) => {
        if (zone.buffer) {
            //
        } else {
            // zone.delay = 0;
            if (zone.sample) {
                const decoded = atob(zone.sample);
                zone.buffer = audioContext.createBuffer(1, decoded.length / 2, zone.sampleRate);
                const float32Array = zone.buffer.getChannelData(0);
                let b1, b2, n;
                for (let i = 0; i < decoded.length / 2; i++) {
                    b1 = decoded.charCodeAt(i * 2);
                    b2 = decoded.charCodeAt(i * 2 + 1);
                    if (b1 < 0) {
                        b1 = 256 + b1;
                    }
                    if (b2 < 0) {
                        b2 = 256 + b2;
                    }
                    n = b2 * 256 + b1;
                    if (n >= 65536 / 2) {
                        n = n - 65536;
                    }
                    float32Array[i] = n / 65536.0;
                }
            } else {
                if (zone.file) {
                    const datalen = zone.file.length;
                    const arraybuffer = new ArrayBuffer(datalen);
                    const view = new Uint8Array(arraybuffer);
                    const decoded = atob(zone.file);
                    let b;
                    for (let i = 0; i < decoded.length; i++) {
                        b = decoded.charCodeAt(i);
                        view[i] = b;
                    }
                    audioContext.decodeAudioData(arraybuffer, function (audioBuffer) {
                        zone.buffer = audioBuffer;
                    });
                }
            }
            zone.loopStart = this.numValue(zone.loopStart, 0);
            zone.loopEnd = this.numValue(zone.loopEnd, 0);
            zone.coarseTune = this.numValue(zone.coarseTune, 0);
            zone.fineTune = this.numValue(zone.fineTune, 0);
            zone.originalPitch = this.numValue(zone.originalPitch, 6000);
            zone.sampleRate = this.numValue(zone.sampleRate, 44100);
            zone.sustain = this.numValue(zone.originalPitch, 0);
        }
    };

    //鳴らしたい高さの音を探す
    findZone = (audioContext, preset, pitch): Zone => {
        let zone = null;
        for (let i = preset.zones.length - 1; i >= 0; i--) {
            zone = preset.zones[i];
            if (zone.keyRangeLow <= pitch && zone.keyRangeHigh + 1 >= pitch) {
                break;
            }
        }
        try {
            this.adjustZone(audioContext, zone);
        } catch (ex) {
            console.log('adjustZone', ex);
        }
        return zone;
    };

    // this.cancelQueue = function (audioContext) {
    //   for (var i = 0; i < this.envelopes.length; i++) {
    //     var e = this.envelopes[i];
    //     e.gain.cancelScheduledValues(0);
    //     console.log(`WebAudioFontPlayer.js: cancelQueue()`)
    //     e.gain.setValueAtTime(this.nearZero, audioContext.currentTime);
    //     e.when = -1;
    //     try {
    //       e.audioBufferSourceNode.disconnect();
    //     } catch (ex) {
    //       console.log(ex);
    //     }
    //   }
    // };

    return
    this;
};
