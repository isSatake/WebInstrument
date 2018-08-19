export type Envelope = {
    target,
    cancel: () => void,
    when,
    duration,
    pitch,
    font,
    audioBufferSourceNode
} & GainNode

export type Zone = {
    midi?: number,
    keyRangeLow?: number,
    keyRangeHigh?: number,
    loopStart: number,
    loopEnd: number,
    coarseTune: number,
    fineTune: number,
    originalPitch: number,
    sampleRate: number,
    ahdsr?: boolean,
    sustain?: number,
    offset?: number,
    release?: number,
    file?: string,
    sample?: any,
    buffer?: any
}

export type Font = {
    zones: Zone[]
}


export type PageData = {
    soundUrl?: string,
    fontUrl?: string,
    release?: number,
    offset?: number,
    isFixedPitch?: boolean,      //ピッチを固定するかどうか(デフォルトfalse)
    noteNumber?: number          //音源を鳴らすノートナンバー(デフォルト0-127)
    //pitchOffset?: number       //入力されたノートナンバーに足す数値(デフォルト0)
    //noteLow?: number,
    //noteHigh?: number
}

export type Note = {
    pitch: number,
    envelope: Envelope
}

export type Line = {
    text: string
}