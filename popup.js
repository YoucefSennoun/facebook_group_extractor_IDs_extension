document.addEventListener('DOMContentLoaded', function() {
    const keywordInput = document.getElementById('keyword');
    const openSearchBtn = document.getElementById('openSearch');
    const extractIdsBtn = document.getElementById('extractIds');
    const exportBtn = document.getElementById('exportBtn');
    const resultsSection = document.getElementById('resultsSection');
    const loadingSection = document.getElementById('loadingSection');
    const statusSection = document.getElementById('statusSection');
    const resultsDiv = document.getElementById('results');
    
    let extractedGroups = [];
    
    // Load saved keyword from Chrome storage
    chrome.storage.local.get(['lastKeyword'], function(result) {
        if (result.lastKeyword) {
            keywordInput.value = result.lastKeyword;
        }
    });

    // Load previously extracted groups if available (e.g., from context menu extraction)
    chrome.storage.local.get(['lastExtractedGroups'], function(result) {
        if (result.lastExtractedGroups && result.lastExtractedGroups.length > 0) {
            extractedGroups = result.lastExtractedGroups;
            displayResults(extractedGroups);
            setStatus(`Loaded ${extractedGroups.length} groups from previous extraction.`);
        }
    });
    
    // Event listener for opening Facebook search in a new tab
    openSearchBtn.addEventListener('click', function() {
        const keyword = keywordInput.value.trim();
        if (!keyword) {
            setStatus('Please enter a search keyword first');
            return;
        }
        
        // Save keyword to Chrome storage
        chrome.storage.local.set({lastKeyword: keyword});
        
        // Construct the Facebook group search URL
        const searchUrl = `https://www.facebook.com/search/groups/?q=${encodeURIComponent(keyword)}`;
        // Create a new tab with the search URL
        chrome.tabs.create({ url: searchUrl });
        setStatus('Facebook search opened. Navigate to the groups tab if needed, then click "Extract IDs"');
    });
    
    // Event listener for extracting group IDs from the current Facebook page
    extractIdsBtn.addEventListener('click', function() {
        // Query for the active tab in the current window
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const currentTab = tabs[0];
            
            // Check if the current tab is a Facebook page
            if (!currentTab.url || (!currentTab.url.includes('facebook.com') && !currentTab.url.includes('fb.com'))) {
                setStatus('Please navigate to Facebook first to extract groups.');
                return;
            }
            
            showLoading(true); // Show loading indicator
            setStatus('Extracting group IDs from current page...');
            
            // Send a message to the content script to extract groups
            chrome.tabs.sendMessage(currentTab.id, {action: "extractGroups"}, function(response) {
                showLoading(false); // Hide loading indicator
                
                // Handle potential errors from the content script
                if (chrome.runtime.lastError) {
                    setStatus('Error extracting groups: ' + chrome.runtime.lastError.message);
                    console.error('Error sending message to content script:', chrome.runtime.lastError.message);
                    return;
                }
                
                // Process the response from the content script
                if (response && response.groups) {
                    const groups = response.groups;
                    if (groups.length > 0) {
                        extractedGroups = groups; // Store extracted groups
                        displayResults(groups); // Display results in the popup
                        setStatus(`Found ${groups.length} groups`);
                        // Store results for later access (e.g., if popup is closed and reopened)
                        chrome.storage.local.set({lastExtractedGroups: groups, extractionTimestamp: Date.now()});
                    } else {
                        setStatus('No groups found on this page. Make sure you\'re on a Facebook groups search results page or a page listing groups.');
                    }
                } else {
                    setStatus('Extraction failed or no data returned. Ensure the content script is running correctly.');
                }
            });
        });
    });
    
    // Event listener for exporting results to CSV
    exportBtn.addEventListener('click', function() {
        if (extractedGroups.length === 0) {
            setStatus('No groups to export. Please extract IDs first.');
            return;
        }
        
        exportToCSV(extractedGroups); // Call the CSV export function
        setStatus('CSV file exported successfully!');
    });
    
    /**
     * Escapes a single cell for CSV output.
     * Encloses the cell in double quotes and escapes any internal double quotes by doubling them.
     * @param {string} cell - The cell content to escape.
     * @returns {string} The escaped cell string.
     */
    function escapeCsvCell(cell) {
        // Ensure the cell is treated as a string
        const stringCell = String(cell);
        // Escape existing double quotes by replacing them with two double quotes
        const escapedCell = stringCell.replace(/"/g, '""');
        // Enclose the entire cell in double quotes
        return `"${escapedCell}"`;
    }

    /**
     * Exports the given array of group objects to a CSV file.
     * @param {Array<Object>} groups - An array of group objects (e.g., {id, name, url}).
     */
    function exportToCSV(groups) {
        // Create the CSV header row
        const header = ['Group Name', 'Group ID', 'Group URL'];
        // Map group objects to CSV rows, escaping each cell
        const rows = groups.map(group => [group.name, group.id, group.url].map(escapeCsvCell).join(','));
        
        // Combine header and rows into the final CSV content
        const csvContent = [header.map(escapeCsvCell).join(','), ...rows].join('\n');
        
        // Create a Blob from the CSV content
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        // Create a URL for the Blob
        const url = URL.createObjectURL(blob);
        
        // Trigger a download of the CSV file using Chrome's downloads API
        chrome.downloads.download({
            url: url,
            filename: `facebook_groups_${new Date().toISOString().slice(0, 10)}.csv`, // Dynamic filename
            saveAs: true // Prompt user to choose download location
        });
    }
    
    /**
     * Displays the extracted groups in the popup's results section.
     * @param {Array<Object>} groups - An array of group objects to display.
     */
    function displayResults(groups) {
        resultsDiv.innerHTML = ''; // Clear previous results
        resultsSection.classList.remove('hidden'); // Show the results section
        
        // Iterate over each group and create a display item
        groups.forEach(group => {
            const resultItem = document.createElement('div');
            resultItem.className = 'result-item';
            
            // Populate the item with group name, ID, and a link
            resultItem.innerHTML = `
                <div class="group-name">${escapeHtml(group.name || 'Unknown Group')}</div>
                <div class="group-id">ID: ${escapeHtml(group.id)}</div>
                <a href="${escapeHtml(group.url)}" target="_blank" class="group-link">View Group →</a>
            `;
            
            resultsDiv.appendChild(resultItem); // Add the item to the results div
        });
    }
    
    /**
     * Updates the status message displayed in the popup.
     * @param {string} message - The message to display.
     */
    function setStatus(message) {
        statusSection.textContent = message;
    }
    
    /**
     * Shows or hides the loading indicator and adjusts the results section visibility.
     * @param {boolean} show - True to show loading, false to hide.
     */
    function showLoading(show) {
        if (show) {
            loadingSection.classList.remove('hidden'); // Show loading spinner
            resultsSection.classList.add('hidden'); // Hide results section
        } else {
            loadingSection.classList.add('hidden'); // Hide loading spinner
            // Results section visibility will be handled by displayResults if groups are found
        }
    }
    
    /**
     * Escapes HTML entities in a string to prevent XSS.
     * @param {string} text - The text to escape.
     * @returns {string} The HTML-escaped string.
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Allow pressing Enter key in the keyword input to trigger the search
    keywordInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            openSearchBtn.click();
        }
    });
});
