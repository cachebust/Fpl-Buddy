// Minimal background script
// In MV3, service workers are ephemeral. We don't need much logic here 
// unless we need to proxy requests, but FPL API usually allows calls from the content script context 
// if the host permissions are set for fantasy.premierleague.com.

chrome.runtime.onInstalled.addListener(() => {
    console.log('Fpl-Buddy Extension installed.');
});
