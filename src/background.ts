const msg = "browser_action";
let tabId: number;

const onMessageListener = (request, sender, sendResponse) => {
    if(request.message === "WebInstrument") tabId = sender.tab.id;
    console.log(msg, "onmessage from content_script");
};

const onClickListener = tab => {
    console.log(msg, "onclick");
    chrome.tabs.sendMessage(tabId, {message: "change_input_source"});
};

chrome.runtime.onMessage.addListener(onMessageListener);
chrome.browserAction.onClicked.addListener(onClickListener);