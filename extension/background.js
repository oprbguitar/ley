// Al pulsar el icono se abre el archivo de leyes en una pestaña completa.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});
