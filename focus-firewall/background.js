/**
 * Focus Firewall — Background Service Worker
 * Handles messaging between popup and content scripts,
 * manages storage, and coordinates extension state.
 */

// Set default state on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    focusGoal: '',
    isEnabled: true,
    socialTimers: {} // Track per-tab social media timers
  });
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {

    // Return the current goal and enabled state to any requester
    case 'GET_STATE':
      chrome.storage.local.get(['focusGoal', 'isEnabled'], (data) => {
        sendResponse({
          focusGoal: data.focusGoal || '',
          isEnabled: data.isEnabled !== false
        });
      });
      return true; // Keep channel open for async response

    // Update goal from popup
    case 'SET_GOAL':
      chrome.storage.local.set({ focusGoal: message.goal }, () => {
        // Notify all tabs of the goal change so content scripts react immediately
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach((tab) => {
            chrome.tabs.sendMessage(tab.id, {
              type: 'GOAL_UPDATED',
              goal: message.goal
            }).catch(() => {}); // Ignore tabs without content scripts
          });
        });
        sendResponse({ success: true });
      });
      return true;

    // Toggle extension ON/OFF from popup
    case 'SET_ENABLED':
      chrome.storage.local.set({ isEnabled: message.isEnabled }, () => {
        // Notify all tabs so content scripts enable/disable immediately
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach((tab) => {
            chrome.tabs.sendMessage(tab.id, {
              type: 'TOGGLE_CHANGED',
              isEnabled: message.isEnabled
            }).catch(() => {});
          });
        });
        sendResponse({ success: true });
      });
      return true;

    default:
      break;
  }
});
