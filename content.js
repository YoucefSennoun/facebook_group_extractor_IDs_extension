// Content script that runs on Facebook pages
(function() {
    'use strict';
    
    // Listen for messages from the popup or background script
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if (request.action === 'extractGroups') {
            const groups = extractGroupsFromPage();
            sendResponse({groups: groups}); // Send extracted groups back
        }
        // Return true to indicate that sendResponse will be called asynchronously
        return true; 
    });
    
    /**
     * Extracts Facebook group IDs, names, and URLs from the current page.
     * It tries to be robust against Facebook's changing DOM structure.
     * @returns {Array<Object>} An array of group objects, each with id, name, and url.
     */
    function extractGroupsFromPage() {
        const groups = [];
        const seenIds = new Set(); // To prevent duplicate entries
        
        try {
            // Select all anchor tags that likely point to a Facebook group
            // This covers various common patterns for group links
            const groupLinks = document.querySelectorAll('a[href*="/groups/"], a[href*="facebook.com/groups/"]');
            
            groupLinks.forEach(link => {
                try {
                    const href = link.href;
                    
                    // Extract group ID from the URL (e.g., /groups/123456789/)
                    const groupIdMatch = href.match(/\/groups\/(\d+)/);
                    if (!groupIdMatch) {
                        // Also try to match for group names in URL that are not IDs (e.g., /groups/my.awesome.group/)
                        const groupNameInUrlMatch = href.match(/\/groups\/([a-zA-Z0-9\.\-]+)/);
                        if (groupNameInUrlMatch && !/\d/.test(groupNameInUrlMatch[1])) { // Ensure it's not a numeric ID
                            // For now, we prioritize numeric IDs as they are more stable.
                            // If we can't get a numeric ID, we might still capture the name later.
                            return; 
                        }
                        return; // Skip if no group ID found
                    }
                    
                    const groupId = groupIdMatch[1];
                    
                    // Skip if this group ID has already been processed
                    if (seenIds.has(groupId)) return;
                    seenIds.add(groupId);
                    
                    let groupName = 'Unknown Group'; // Default name
                    
                    // --- Robust Group Name Extraction Strategy ---
                    // Try to find the group name using various selectors and DOM traversal
                    const nameSelectors = [
                        '[role="heading"]', // Common for titles/headings
                        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', // Standard HTML headings
                        'strong', 'span[dir="auto"]', // Common text elements
                        '.x1heor9g', '.x1qlqyl8', '.x1lli2ws', '.x193iq5w', // Common Facebook classes (less reliable)
                        '[aria-label]', '[title]' // Accessibility attributes
                    ];

                    // 1. Check direct children of the link
                    for (const selector of nameSelectors) {
                        const nameElement = link.querySelector(selector);
                        if (nameElement && nameElement.textContent.trim()) {
                            groupName = nameElement.textContent.trim();
                            break;
                        }
                    }

                    // 2. If not found, check the link's own text content
                    if (groupName === 'Unknown Group' && link.textContent.trim()) {
                        groupName = link.textContent.trim();
                    }

                    // 3. If still not found, traverse up to parent elements and search for text
                    if (groupName === 'Unknown Group') {
                        let currentElement = link.parentElement;
                        let maxDepth = 5; // Limit traversal depth to avoid performance issues
                        let depth = 0;

                        while (currentElement && depth < maxDepth) {
                            for (const selector of nameSelectors) {
                                const nameElement = currentElement.querySelector(selector);
                                if (nameElement && nameElement.textContent.trim() && nameElement.textContent.trim().length > 5) { // Ensure a meaningful name
                                    groupName = nameElement.textContent.trim();
                                    break;
                                }
                            }
                            if (groupName !== 'Unknown Group') break; // Found a name, stop
                            currentElement = currentElement.parentElement;
                            depth++;
                        }
                    }

                    // 4. Try to get name from aria-label or title of the link itself
                    if (groupName === 'Unknown Group') {
                        if (link.getAttribute('aria-label') && link.getAttribute('aria-label').trim()) {
                            groupName = link.getAttribute('aria-label').trim();
                        } else if (link.getAttribute('title') && link.getAttribute('title').trim()) {
                            groupName = link.getAttribute('title').trim();
                        }
                    }
                    
                    // Clean the URL by removing query parameters and hash fragments
                    const cleanUrl = href.split('?')[0].split('#')[0];
                    
                    groups.push({
                        id: groupId,
                        name: groupName,
                        url: cleanUrl
                    });
                    
                } catch (error) {
                    console.error('Error processing group link:', error);
                }
            });
            
            // --- Additional extraction for elements that might not be direct links but contain group info ---
            // This targets elements that have data attributes or other patterns indicating a group
            const elementsWithData = document.querySelectorAll('[data-href*="/groups/"], [data-hovercard*="/groups/"]');
            elementsWithData.forEach(element => {
                try {
                    const dataHref = element.getAttribute('data-href') || element.getAttribute('href');
                    const dataHovercard = element.getAttribute('data-hovercard');

                    let targetUrl = dataHref || dataHovercard;

                    if (targetUrl) {
                        const groupIdMatch = targetUrl.match(/\/groups\/(\d+)/);
                        if (groupIdMatch) {
                            const groupId = groupIdMatch[1];
                            if (!seenIds.has(groupId)) {
                                seenIds.add(groupId);
                                
                                let inferredName = element.textContent.trim();
                                if (!inferredName || inferredName.length < 5) { // If text content is too short or empty
                                    // Try to find a more descriptive name in children or siblings
                                    const nameElement = element.querySelector('[role="heading"]') || 
                                                        element.querySelector('span[dir="auto"]') ||
                                                        element.querySelector('strong');
                                    if (nameElement && nameElement.textContent.trim()) {
                                        inferredName = nameElement.textContent.trim();
                                    } else if (element.getAttribute('aria-label')) {
                                        inferredName = element.getAttribute('aria-label').trim();
                                    }
                                }

                                groups.push({
                                    id: groupId,
                                    name: inferredName || 'Unknown Group (Data Attribute)',
                                    url: `https://www.facebook.com/groups/${groupId}`
                                });
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error processing data attribute element:', error);
                }
            });
            
        } catch (error) {
            console.error('General error during group extraction:', error);
        }
        
        return groups;
    }
    
    /**
     * Adds a visual indicator to the page when the extension is active.
     */
    function addActiveIndicator() {
        if (document.getElementById('fb-group-extractor-indicator')) return; // Prevent multiple indicators
        
        const indicator = document.createElement('div');
        indicator.id = 'fb-group-extractor-indicator';
        indicator.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: #4CAF50; /* Green background */
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-family: sans-serif;
            z-index: 10000; /* Ensure it's on top */
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            opacity: 0.9;
            transition: opacity 0.3s ease-in-out;
        `;
        indicator.textContent = '🔍 FB Group Extractor Active';
        document.body.appendChild(indicator);
        
        // Remove the indicator after 3 seconds
        setTimeout(() => {
            if (indicator.parentNode) {
                indicator.style.opacity = '0'; // Fade out
                setTimeout(() => {
                    if (indicator.parentNode) {
                        indicator.parentNode.removeChild(indicator);
                    }
                }, 300); // Remove after fade
            }
        }, 3000);
    }
    
    // Show the active indicator when on relevant Facebook pages
    // This ensures the user knows the content script is running.
    if (window.location.href.includes('facebook.com') && 
        (window.location.href.includes('/groups') || window.location.href.includes('search'))) {
        addActiveIndicator();
    }
    
})();
