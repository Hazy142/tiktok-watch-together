// Background Service Worker for Chrome Extension v3
// Handles cross-tab communication and screen capture permissions

console.log('📱 Background Service Worker started');

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[BG] Message received:', message);
  
  if (message.action === 'check_screen_share_support') {
    // Check if this Chrome version supports getDisplayMedia
    const supported = !!navigator.mediaDevices?.getDisplayMedia;
    sendResponse({ supported });
  }
  
  if (message.action === 'get_extension_version') {
    const manifest = chrome.runtime.getManifest();
    sendResponse({ version: manifest.version });
  }
  
  if (message.action === 'notify_extension_installed') {
    console.log('✅ Extension installed/updated');
    // Could trigger first-run setup here
  }
});

// Handle extension installed/updated
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('✅ Extension installed');
    // Open welcome page
    chrome.tabs.create({
      url: chrome.runtime.getURL('welcome.html')
    });
  } else if (details.reason === 'update') {
    console.log('🔄 Extension updated');
  }
});

// Cleanup on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  console.log(`📍 Tab ${tabId} closed`);
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  console.log('🎬 Extension icon clicked on:', tab.url);
  // Popup will open automatically via default_popup
});
