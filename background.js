// Background service worker for the Chrome extension
chrome.runtime.onInstalled.addListener(function() {
    console.log('Facebook Group ID Extractor installed');
});

// Handle extension icon click
chrome.action.onClicked.addListener(function(tab) {
    // The popup will handle the main functionality
    // This is just for any additional background tasks
});

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'downloadCSV') {
        // Handle CSV download if needed
        const csvData = request.data;
        const blob = new Blob([csvData], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        
        chrome.downloads.download({
            url: url,
            filename: request.filename || 'facebook_groups.csv'
        });
        
        sendResponse({success: true});
    }
    
    return true; // Keep message channel open for async response
});

// Optional: Add context menu for quick access
chrome.runtime.onInstalled.addListener(function() {
    chrome.contextMenus.create({
        id: "extractGroupIds",
        title: "Extract Group IDs",
        contexts: ["page"],
        documentUrlPatterns: ["https://www.facebook.com/*", "https://facebook.com/*"]
    });
});

chrome.contextMenus.onClicked.addListener(function(info, tab) {
    if (info.menuItemId === "extractGroupIds") {
        // Send message to content script to extract groups
        chrome.tabs.sendMessage(tab.id, {action: "extractGroups"}, function(response) {
            if (response && response.groups) {
                // Store results for popup to access
                chrome.storage.local.set({
                    lastExtractedGroups: response.groups,
                    extractionTimestamp: Date.now()
                });
            }
        });
    }
});

// Clean up old stored data periodically
chrome.alarms.create('cleanup', { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener(function(alarm) {
    if (alarm.name === 'cleanup') {
        chrome.storage.local.get(['extractionTimestamp'], function(result) {
            if (result.extractionTimestamp) {
                const hourAgo = Date.now() - (60 * 60 * 1000);
                if (result.extractionTimestamp < hourAgo) {
                    chrome.storage.local.remove(['lastExtractedGroups', 'extractionTimestamp']);
                }
            }
        });
    }
});