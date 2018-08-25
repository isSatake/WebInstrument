const titleEl = document.createElement("div");
titleEl.textContent = "WebInstrument";

const sourceEl = document.createElement("div");
sourceEl.setAttribute("id", "sourceEl");

const webInstrumentEl = document.createElement("div");
webInstrumentEl.appendChild(titleEl);
webInstrumentEl.appendChild(sourceEl);

const {style} = webInstrumentEl;
style.position = "fixed";
style.bottom = "0";
style.left = "0";
style.backgroundColor = "#f89174";
style.zIndex = "300";

const parentEl = document.getElementById("app-container");
parentEl.appendChild(webInstrumentEl);

export const updateSourceEl = (doesHandlePCKey: boolean) => {
    const sourceEl = document.getElementById("sourceEl");
    sourceEl.textContent = `source: ${doesHandlePCKey ? "PC key" : "MIDI device"}`;
};

