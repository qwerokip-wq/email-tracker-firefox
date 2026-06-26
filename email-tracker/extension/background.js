console.log('[EmailTracker] Background script loaded');

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'sync-stats') {
    sendResponse({ ok: true });
  }
});
