// Client-side JavaScript for Pollinations.AI Auth

// Export the JavaScript as a string to be included in the HTML template
export const JS = `

<script>
// Global variables
const API_BASE = window.location.origin;
let authToken = null;
let userId = null;
let currentDomains = [];
let apiToken = null;
let userTier = 'seed';
let userPreferences = {};
// AbortController for cost chart requests to prevent outdated responses when navigating quickly
let costChartAbortController = null;

// Define all functions in global scope so they can be accessed by inline event handlers

// Initialize on page load
window.addEventListener('load', function() {
    // Add event delegation for domain removal
    document.addEventListener('click', function(event) {
        const target = event.target;
        if (target && target.classList.contains('remove-domain')) {
            const domain = target.getAttribute('data-domain');
            if (domain) {
                removeDomain(domain);
            }
        }
    });
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const username = params.get('username');
    
    if (token && username) {
        // Store token and show success message
        authToken = token;
        showStatus('auth-status', '✅ Authenticated as ' + username + ' 🎉', 'success');
        
        // Show user section and domain section
        document.getElementById('user-section').classList.remove('hidden');
        document.getElementById('domain-section').classList.remove('hidden');
        // Toggle auth/logout buttons
        document.getElementById('auth-button').classList.add('hidden');
        document.getElementById('logout-button').classList.remove('hidden');
        
        // Store in localStorage for persistence
        localStorage.setItem('github_auth_token', token);
        localStorage.setItem('github_username', username);
        localStorage.setItem('github_user_id', params.get('user_id') || '');
        
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Automatically load user info, domains, token and preferences
        userId = params.get('user_id');
        getUserInfo();
        getDomains();
        getApiToken();
        getUserPreferences();
        loadUserData();
        // Hide intro text when user is logged in
        const introEl = document.getElementById('intro-text');
        if (introEl) introEl.classList.add('hidden');
    } else {
        // Check for stored token
        const storedToken = localStorage.getItem('github_auth_token');
        const storedUsername = localStorage.getItem('github_username');
        const storedUserId = localStorage.getItem('github_user_id');
        
        if (storedToken && storedUsername) {
            authToken = storedToken;
            userId = storedUserId;
            showStatus('auth-status', '✅ Authenticated as ' + storedUsername + ' 🎉', 'success');
            
            // Toggle auth/logout buttons
            document.getElementById('auth-button').classList.add('hidden');
            document.getElementById('logout-button').classList.remove('hidden');
            
            document.getElementById('user-section').classList.remove('hidden');
            document.getElementById('domain-section').classList.remove('hidden');
            
            // Automatically load user info, domains, token, preferences, and cost
            getUserInfo();
            getDomains();
            getApiToken();
            getUserPreferences();
            getUserCost();
            getUserCostChart();
            // Hide intro text when user is logged in (stored session)
            const introEl = document.getElementById('intro-text');
            if (introEl) introEl.classList.add('hidden');
        }
    }
});

// Start authentication
window.startAuth = function() {
    // Use the current path as the redirect URI (works for both / and /test-client)
    const redirectUri = encodeURIComponent(window.location.href);
    window.location.href = API_BASE + '/authorize?redirect_uri=' + redirectUri;
}

// Logout function
window.logout = function() {
    // Clear stored data
    localStorage.removeItem('github_auth_token');
    localStorage.removeItem('github_username');
    localStorage.removeItem('github_user_id');
    
    // Reset UI
    authToken = null;
    userId = null;
    currentDomains = [];
    apiToken = null;
    
    // Toggle auth/logout buttons
    document.getElementById('auth-button').classList.remove('hidden');
    document.getElementById('logout-button').classList.add('hidden');
    
    // Hide sections
    document.getElementById('user-section').classList.add('hidden');
    document.getElementById('domain-section').classList.add('hidden');
    document.getElementById('cost-section').classList.add('hidden');
    
    // Show logout message
    showStatus('auth-status', '👋 Logged out successfully', 'info');
    
    // Clear badge
    const badgeEl = document.getElementById('badge-container');
    if (badgeEl) {
        badgeEl.innerHTML = '';
        badgeEl.classList.add('hidden');
    }
    // Show intro text when user logs out
    const introEl = document.getElementById('intro-text');
    if (introEl) introEl.classList.remove('hidden');
}

// Handle token errors (expired or invalid tokens)
function handleTokenError() {
    // Clear stored data
    localStorage.removeItem('github_auth_token');
    localStorage.removeItem('github_username');
    localStorage.removeItem('github_user_id');
    
    // Reset UI
    authToken = null;
    userId = null;
    currentDomains = [];
    apiToken = null;
    userTier = 'seed';
    
    // Toggle auth/logout buttons
    document.getElementById('auth-button').classList.remove('hidden');
    document.getElementById('logout-button').classList.add('hidden');
    
    // Hide sections
    document.getElementById('user-section').classList.add('hidden');
    document.getElementById('domain-section').classList.add('hidden');
    document.getElementById('cost-section').classList.add('hidden');
    
    // Show logout message
    showStatus('auth-status', '⏰ Your session has expired. Please log in again.', 'info');
    
    // Clear badge
    const badgeEl2 = document.getElementById('badge-container');
    if (badgeEl2) {
        badgeEl2.innerHTML = '';
        badgeEl2.classList.add('hidden');
    }
    // Show intro text when session expires or token invalid
    const introEl = document.getElementById('intro-text');
    if (introEl) introEl.classList.remove('hidden');
}

// Get user info
async function getUserInfo() {
    if (!authToken) {
        showStatus('user-info', '❌ Not authenticated', 'error');
        return;
    }
    
    try {
        const response = await fetch(API_BASE + '/api/user', {
            headers: {
                'Authorization': 'Bearer ' + authToken
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            userId = data.github_user_id;
            
            // Store user ID for persistence
            localStorage.setItem('github_user_id', userId);
            
            const userHtml = '<div class="profile-badge">' +
              '<span class="gh-icon">🐙</span>' +
              '<span class="username">@' + data.username + '</span>' +
              '<span class="user-id">#' + userId + '</span>' +
            '</div>';
            // Inject into badge container next to logout button
            const badgeEl = document.getElementById('badge-container');
            if (badgeEl) {
              badgeEl.innerHTML = userHtml;
              badgeEl.classList.remove('hidden');
            }

            // Optionally clear the old user-info badge
            showStatus('user-info', '', 'info');
            
            // Now that we have the user ID, get domains, token, tier, and cost
            getDomains();
            getApiToken();
            getUserTier();
            getUserCost();
        } else {
            // Check if unauthorized (token expired or invalid)
            if (response.status === 401) {
                handleTokenError();
            } else {
                showStatus('user-info', '❌ Error: ' + response.statusText, 'error');
            }
        }
    } catch (error) {
        showStatus('user-info', '❌ Error: ' + error.message, 'error');
    }
}

// Get domains
async function getDomains() {
    if (!authToken || !userId) {
        showStatus('domain-info', '❌ Get user info first', 'error');
        return;
    }
    
    try {
        const response = await fetch(API_BASE + '/api/domains?user_id=' + userId, {
            headers: {
                'Authorization': 'Bearer ' + authToken
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            currentDomains = data.domains || [];
            displayDomains();
        } else {
            // Check if unauthorized (token expired or invalid)
            if (response.status === 401) {
                handleTokenError();
            } else {
                showStatus('domain-info', '❌ Error: ' + response.statusText, 'error');
            }
        }
    } catch (error) {
        showStatus('domain-info', '❌ Error: ' + error.message, 'error');
    }
}

// Display domains
function displayDomains() {
    let domainHtml = '';
    
    if (currentDomains.length > 0) {
        domainHtml = '<strong>🌐 Registered:</strong><div style="margin-top:10px">';
        for (const domain of currentDomains) {
            // Use data attributes instead of inline onclick handlers
            domainHtml += '<span class="domain-item">' + domain + 
                '<span class="remove-domain" data-domain="' + domain + '">&times;</span></span>';
        }
        domainHtml += '</div>';
    } else {
        domainHtml = '<em>No domains allowed yet</em> 🔍';
    }
    
    showStatus('domain-info', domainHtml, 'info');
}

// Add domain
window.addDomain = async function() {
    const domain = document.getElementById('new-domain').value.trim();
    if (!domain) {
        showStatus('domain-info', '❌ Please enter a domain', 'error');
        return;
    }
    
    if (!authToken || !userId) {
        showStatus('domain-info', '❌ Get user info first', 'error');
        return;
    }
    
    const newDomains = [...currentDomains, domain];
    
    try {
        const response = await fetch(API_BASE + '/api/domains?user_id=' + userId, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + authToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ domains: newDomains })
        });
        
        if (response.ok) {
            currentDomains = newDomains;
            document.getElementById('new-domain').value = '';
            displayDomains();
        } else {
            showStatus('domain-info', '❌ Error: ' + response.statusText, 'error');
        }
    } catch (error) {
        showStatus('domain-info', '❌ Error: ' + error.message, 'error');
    }
}

// Remove domain
window.removeDomain = async function(domainToRemove) {
    if (!authToken || !userId) {
        showStatus('domain-info', '❌ Get user info first', 'error');
        return;
    }
    
    const newDomains = currentDomains.filter(domain => domain !== domainToRemove);
    
    try {
        const response = await fetch(API_BASE + '/api/domains?user_id=' + userId, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + authToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ domains: newDomains })
        });
        
        if (response.ok) {
            currentDomains = newDomains;
            displayDomains();
        } else {
            showStatus('domain-info', '❌ Error: ' + response.statusText, 'error');
        }
    } catch (error) {
        showStatus('domain-info', '❌ Error: ' + error.message, 'error');
    }
}

// Get user tier
async function getUserTier() {
    if (!authToken || !userId) {
        // Hide tier section if not authenticated
        document.getElementById('tier-section').classList.add('hidden');
        return;
    }
    // Show tier section when authenticated
    document.getElementById('tier-section').classList.remove('hidden');
    
    try {
        const response = await fetch(API_BASE + '/api/user-tier?user_id=' + userId, {
            headers: {
                'Authorization': 'Bearer ' + authToken
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            userTier = data.tier || 'seed';
            updateTierDisplay();
        } else {
            // Check if unauthorized (token expired or invalid)
            if (response.status === 401) {
                handleTokenError();
            } else {
                // If there's another error, default to seed tier
                userTier = 'seed';
                updateTierDisplay();
                console.error('Error fetching user tier:', response.statusText);
            }
        }
    } catch (error) {
        // If there's an error, default to seed tier
        userTier = 'seed';
        updateTierDisplay();
        console.error('Error fetching user tier:', error);
    }
}

// Update the tier display in the UI
function updateTierDisplay() {
    // Reset all pills
    document.querySelectorAll('.tier-pill').forEach(pill => {
        pill.classList.remove('active');
    });
    
    // Activate the current tier pill
    const activePill = document.getElementById(userTier + '-pill');
    if (activePill) {
        activePill.classList.add('active');
    }
}

// Get user preferences
async function getUserPreferences() {
    if (!authToken || !userId) {
        // Hide preferences section if not authenticated
        if (document.getElementById('preferences-section')) {
            document.getElementById('preferences-section').classList.add('hidden');
        }
        return;
    }
    
    // Show preferences section when authenticated
    if (document.getElementById('preferences-section')) {
        document.getElementById('preferences-section').classList.remove('hidden');
    
        try {
            const response = await fetch(API_BASE + '/preferences', {
                headers: {
                    'Authorization': 'Bearer ' + authToken
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                userPreferences = data.preferences || {};
                
                // Update toggle state
                updateAdsToggleUI();
            } else {
                // Check if unauthorized (token expired or invalid)
                if (response.status === 401) {
                    // Don't call handleTokenError() directly to avoid disrupting flow
                    console.error('Unauthorized when getting preferences');
                    document.getElementById('ads-status').textContent = 'Auth error';
                } else {
                    console.error('Error fetching preferences:', response.statusText);
                    document.getElementById('ads-status').textContent = 'Error loading preferences';
                }
            }
        } catch (error) {
            console.error('Error fetching preferences:', error);
            document.getElementById('ads-status').textContent = 'Error loading preferences';
        }
    }
}

// Update the ads toggle UI based on current preferences
function updateAdsToggleUI() {
    const adsToggle = document.getElementById('ads-toggle');
    const adsStatus = document.getElementById('ads-status');
    
    // Only update if elements exist
    if (adsToggle && adsStatus) {
        // Set toggle state based on preferences
        const showAds = userPreferences.show_ads !== false; // Default to true if not set
        adsToggle.checked = showAds;
        
        // Update status text
        adsStatus.textContent = showAds ? 'Enabled' : 'Disabled';
    }
}

// Toggle ads preference
window.toggleAdsPreference = async function() {
    if (!authToken || !userId) {
        return;
    }
    
    const adsToggle = document.getElementById('ads-toggle');
    const adsStatus = document.getElementById('ads-status');
    
    // Check if elements exist
    if (!adsToggle || !adsStatus) {
        console.error('Toggle elements not found');
        return;
    }
    
    // Get new state from toggle
    const showAds = adsToggle.checked;
    
    // Update status to loading
    adsStatus.textContent = 'Saving...';
    
    try {
        const response = await fetch(API_BASE + '/preferences', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + authToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                key: 'show_ads',
                value: showAds
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            userPreferences = data.preferences || {};
            
            // Update UI
            updateAdsToggleUI();
        } else {
            // Error handling
            if (response.status === 401) {
                console.error('Unauthorized when updating preferences');
                adsStatus.textContent = 'Auth error';
                // Don't call handleTokenError directly to avoid disrupting flow
            } else {
                console.error('Error updating preferences:', response.statusText);
                adsStatus.textContent = 'Error saving preference';
                
                // Revert toggle to previous state
                adsToggle.checked = userPreferences.show_ads !== false;
            }
        }
    } catch (error) {
        console.error('Error updating preferences:', error);
        adsStatus.textContent = 'Error saving preference';
        
        // Revert toggle to previous state
        adsToggle.checked = userPreferences.show_ads !== false;
    }
}

// Get API token
async function getApiToken() {
    if (!authToken || !userId) {
        showStatus('token-info', '❌ Get user info first', 'error');
        return;
    }
    
    try {
        const response = await fetch(API_BASE + '/api/token?user_id=' + userId, {
            headers: {
                'Authorization': 'Bearer ' + authToken
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            apiToken = data.token;
            
            if (apiToken) {
                showStatus('token-info', '<code class="token-value copyable" id="api-token-value" onclick="copyApiToken()" title="Click to copy">' + apiToken + '</code>', 'info');
            } else {
                showStatus('token-info', '⚠️ No API token found. Generate one first! 🔄', 'info');
            }
        } else {
            // Check if unauthorized (token expired or invalid)
            if (response.status === 401) {
                handleTokenError();
            } else {
                showStatus('token-info', '❌ Error: ' + response.statusText, 'error');
            }
        }
    } catch (error) {
        showStatus('token-info', '❌ Error: ' + error.message, 'error');
    }
}

// Generate API token
window.generateApiToken = async function() {
    if (!authToken || !userId) {
        showStatus('token-info', '❌ Get user info first', 'error');
        return;
    }
    
    try {
        const response = await fetch(API_BASE + '/api/token?user_id=' + userId, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + authToken
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            apiToken = data.token;
            
            showStatus('token-info', '<code class="token-value copyable" id="api-token-value" onclick="copyApiToken()" title="Click to copy">' + apiToken + '</code>', 'success');
        } else {
            showStatus('token-info', '❌ Error: ' + response.statusText, 'error');
        }
    } catch (error) {
        showStatus('token-info', '❌ Error: ' + error.message, 'error');
    }
}

// Copy API token to clipboard
window.copyApiToken = async function() {
    if (!apiToken) {
        return;
    }
    try {
        await navigator.clipboard.writeText(apiToken);
        const codeEl = document.getElementById('api-token-value');
        if (codeEl) {
            codeEl.classList.add('copied');
            setTimeout(() => {
                codeEl.classList.remove('copied');
            }, 2000);
        }
    } catch (err) {
        console.error('Failed to copy token:', err);
    }
}

// Get user cost from Tinybird
async function getUserCost() {
    if (!authToken || !userId) {
        // Hide cost section if not authenticated
        document.getElementById('cost-section').classList.add('hidden');
        return;
    }

    // Show cost section with loading animation
    const costSection = document.getElementById('cost-section');
    const costDisplay = document.getElementById('cost-display');
    const costValue = document.getElementById('cost-value');
    
    costSection.classList.remove('hidden');
    costDisplay.classList.add('loading');
    costValue.textContent = '•••';

    try {
        // Get username from localStorage for the API call
        const username = localStorage.getItem('github_username');
        if (!username) {
            costDisplay.classList.remove('loading');
            costValue.textContent = '?';
            return;
        }

        const tinybirdUrl = 'https://api.europe-west2.gcp.tinybird.co/v0/pipes/get_llm_costs.json';
        const tinybirdToken = 'p.eyJ1IjogIjY2ZTg5NDU1LTAzYTgtNGZkNS1iNjg3LWU5NDdhMzY5OThkMyIsICJpZCI6ICJhZjVkZTNiNi04NmVhLTQ4ODMtYjZlYi1iYzJjYjZjOTE3ZjEiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.XH20kZ7QLFsM8sNDsr8w-xS3K8TKb6ieHAysh3K50Co';
        
        const response = await fetch(tinybirdUrl + '?token=' + tinybirdToken + '&username=' + encodeURIComponent(username));
        
        if (response.ok) {
            const data = await response.json();
            
            // Add a small delay to show the loading animation
            setTimeout(() => {
                costDisplay.classList.remove('loading');
                
                if (data.data && data.data.length > 0) {
                    const totalCost = data.data[0].total_cost;
                    
                    // Format cost as rounded integer with plus sign
                    const formattedCost = Math.round(totalCost).toString();
                    costValue.textContent = '+' + formattedCost;
                } else {
                    costValue.textContent = '0';
                }
            }, 800); // Small delay to show the animation
        } else {
            console.error('Failed to fetch cost data:', response.statusText);
            setTimeout(() => {
                costDisplay.classList.remove('loading');
                costValue.textContent = '!';
            }, 500);
        }
    } catch (error) {
        console.error('Error fetching user cost:', error);
        setTimeout(() => {
            costDisplay.classList.remove('loading');
            costValue.textContent = '!';
        }, 500);
    }
}

// Global variable to track current chart view
let currentChartView = 'day';

// Global variables to track date offsets for navigation
let dateOffsets = {
    day: 0,    // offset in days from today
    week: 0,   // offset in weeks from current week
    month: 0   // offset in months from current month
};

// Global variable to store current chart JSON data for copy functionality
let currentChartData = null;

// Debouncing for chart data fetching
let chartDataFetchTimeout = null;

// Update navigation button states based on current offset
function updateNavigationButtons() {
    const nextBtn = document.getElementById('nav-next');
    const isAtPresent = dateOffsets[currentChartView] >= 0;
    
    if (nextBtn) {
        if (isAtPresent) {
            nextBtn.classList.add('inactive');
        } else {
            nextBtn.classList.remove('inactive');
        }
    }
}

// Debounced function to fetch chart data
function debouncedGetUserCostChart() {
    // Clear existing timeout
    if (chartDataFetchTimeout) {
        clearTimeout(chartDataFetchTimeout);
    }
    
    // Set new timeout to fetch data after 300ms of inactivity
    chartDataFetchTimeout = setTimeout(() => {
        getUserCostChart();
    }, 300);
}

// Navigate chart by offset (direction: -1 for previous, +1 for next)
window.navigateChart = function(direction) {
    // Prevent navigation to future dates
    if (direction > 0 && dateOffsets[currentChartView] >= 0) {
        return; // Don't allow going into the future
    }
    
    // Update offset for current view
    dateOffsets[currentChartView] += direction;
    
    // Update chart title to reflect the navigation (immediate feedback)
    updateChartTitle();
    
    // Update navigation button states (immediate feedback)
    updateNavigationButtons();
    
    // Debounced chart data reload
    debouncedGetUserCostChart();
}

// Update chart title based on current view and offset
function updateChartTitle() {
    const chartTitle = document.getElementById('chart-title');
    const now = new Date();
    const offset = dateOffsets[currentChartView];
    
    // Show "Today" only for Day mode when viewing current day
    if (offset === 0 && currentChartView === 'day') {
        chartTitle.textContent = 'Today';
        return;
    }
    
    switch (currentChartView) {
        case 'day':
            // Format: Day Month Year (e.g., "1 Aug 2025")
            const targetDate = new Date(now);
            targetDate.setDate(now.getDate() + offset);
            const dayStr = targetDate.toLocaleDateString('en-US', { 
                day: 'numeric', 
                month: 'short', 
                year: 'numeric' 
            });
            chartTitle.textContent = dayStr;
            break;
        case 'week':
            // Format: Start Day Month Year (e.g., "28 Jul 2025")
            const targetWeekDate = new Date(now);
            targetWeekDate.setDate(now.getDate() + (offset * 7));
            
            // Calculate start of ISO week (Monday)
            const dayOfWeek = targetWeekDate.getDay();
            const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            const weekStart = new Date(targetWeekDate);
            weekStart.setDate(targetWeekDate.getDate() + mondayOffset);
            
            const weekStr = weekStart.toLocaleDateString('en-US', { 
                day: 'numeric', 
                month: 'short', 
                year: 'numeric' 
            });
            chartTitle.textContent = '📊 ' + weekStr;
            break;
        case 'month':
            // Format: Month Year (e.g., "Aug 2025")
            const targetMonth = new Date(now.getFullYear(), now.getMonth() + offset, 1);
            const monthStr = targetMonth.toLocaleDateString('en-US', { 
                month: 'short', 
                year: 'numeric' 
            });
            chartTitle.textContent = '📊 ' + monthStr;
            break;
    }
}

// Load all user data
function loadUserData() {
    getUserInfo();
    getDomains();
    getApiToken();
    getUserPreferences();
    getUserCost();
    getUserCostChart();
}

// Get current date/period parameters for fixed calendar buckets with navigation offset
function getCurrentPeriodParams() {
    const now = new Date();
    const offset = dateOffsets[currentChartView];
    
    switch (currentChartView) {
        case 'day':
            // Date with day offset in YYYY-MM-DD format
            const targetDate = new Date(now);
            targetDate.setDate(now.getDate() + offset);
            return {
                param: 'date',
                value: targetDate.toISOString().split('T')[0]
            };
        case 'week':
            // ISO week with week offset in YYYY-Www format
            const targetWeekDate = new Date(now);
            targetWeekDate.setDate(now.getDate() + (offset * 7));
            
            // Calculate ISO week number
            const jan4 = new Date(targetWeekDate.getFullYear(), 0, 4);
            const weekStart = new Date(jan4);
            weekStart.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
            const weekNumber = Math.floor((targetWeekDate - weekStart) / (7 * 24 * 60 * 60 * 1000)) + 1;
            
            return {
                param: 'isoWeek',
                value: targetWeekDate.getFullYear() + '-W' + String(weekNumber).padStart(2, '0')
            };
        case 'month':
            // Month with month offset in YYYY-MM format
            const targetMonth = new Date(now.getFullYear(), now.getMonth() + offset, 1);
            const yearMonth = targetMonth.getFullYear() + '-' + String(targetMonth.getMonth() + 1).padStart(2, '0');
            return {
                param: 'ym',
                value: yearMonth
            };
        default:
            return { param: 'date', value: now.toISOString().split('T')[0] };
    }
}

// Switch between chart views
window.switchChartView = function(view) {
    if (currentChartView === view) return;
    
    // Calculate the current date being viewed before switching
    const now = new Date();
    const currentOffset = dateOffsets[currentChartView];
    let currentViewingDate;
    
    // Get the actual date currently being viewed
    switch (currentChartView) {
        case 'day':
            currentViewingDate = new Date(now);
            currentViewingDate.setDate(now.getDate() + currentOffset);
            break;
        case 'week':
            currentViewingDate = new Date(now);
            currentViewingDate.setDate(now.getDate() + (currentOffset * 7));
            break;
        case 'month':
            currentViewingDate = new Date(now.getFullYear(), now.getMonth() + currentOffset, now.getDate());
            break;
    }
    
    // Switch to new view
    const oldView = currentChartView;
    currentChartView = view;
    
    // Calculate equivalent offset for the new view to show the same date
    switch (view) {
        case 'day':
            const daysDiff = Math.floor((currentViewingDate - now) / (1000 * 60 * 60 * 24));
            dateOffsets[view] = daysDiff;
            break;
        case 'week':
            const weeksDiff = Math.floor((currentViewingDate - now) / (1000 * 60 * 60 * 24 * 7));
            dateOffsets[view] = weeksDiff;
            break;
        case 'month':
            const monthsDiff = (currentViewingDate.getFullYear() - now.getFullYear()) * 12 + 
                              (currentViewingDate.getMonth() - now.getMonth());
            dateOffsets[view] = monthsDiff;
            break;
    }
    
    // Update button states
    document.getElementById('toggle-day').classList.toggle('active', view === 'day');
    document.getElementById('toggle-week').classList.toggle('active', view === 'week');
    document.getElementById('toggle-month').classList.toggle('active', view === 'month');
    
    // Update chart title based on new offset
    updateChartTitle();
    
    // Update navigation button states
    updateNavigationButtons();
    
    // Reload chart data with new view
    getUserCostChart();
}

// Get user cost chart data from Tinybird (24 hours)
async function getUserCostChart() {
    if (!authToken || !userId) {
        // Hide cost chart section if not authenticated
        document.getElementById('cost-chart-section').classList.add('hidden');
        return;
    }

    // Show cost chart section with loading animation
    const costChartSection = document.getElementById('cost-chart-section');
    const costChart = document.getElementById('cost-chart');
    const chartTotalValue = document.getElementById('chart-total-value');
    
    costChartSection.classList.remove('hidden');
    costChart.classList.add('loading');
    chartTotalValue.textContent = '•••';

    try {
        // Get username from localStorage for the API call
        const username = localStorage.getItem('github_username');
        if (!username) {
            costChart.classList.remove('loading');
            chartTotalValue.textContent = '?';
            return;
        }

        // Choose endpoint and parameters based on current view
        let endpoint, periodParam;
        switch (currentChartView) {
            case 'day':
                endpoint = 'cost_day.json';
                break;
            case 'week':
                endpoint = 'cost_week.json';
                break;
            case 'month':
                endpoint = 'cost_month.json';
                break;
            default:
                endpoint = 'cost_day.json';
        }
        
        const tinybirdUrl = 'https://api.europe-west2.gcp.tinybird.co/v0/pipes/' + endpoint;
        const tinybirdToken = 'p.eyJ1IjogIjY2ZTg5NDU1LTAzYTgtNGZkNS1iNjg3LWU5NDdhMzY5OThkMyIsICJpZCI6ICJhZjVkZTNiNi04NmVhLTQ4ODMtYjZlYi1iYzJjYjZjOTE3ZjEiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.XH20kZ7QLFsM8sNDsr8w-xS3K8TKb6ieHAysh3K50Co';
        
        // Get period parameters for fixed calendar buckets
        const periodParams = getCurrentPeriodParams();
        const queryParams = 'token=' + tinybirdToken + '&user=' + encodeURIComponent(username) + '&' + periodParams.param + '=' + encodeURIComponent(periodParams.value);
        
        // Abort any ongoing request so that only the latest response is used
if (costChartAbortController) {
    costChartAbortController.abort();
}
costChartAbortController = new AbortController();
const { signal } = costChartAbortController;

const response = await fetch(tinybirdUrl + '?' + queryParams, { signal });
        
        if (response.ok) {
            const data = await response.json();
            
            // Store the complete JSON response for copy functionality
            currentChartData = data;
            
            // Add a small delay to show the loading animation
            setTimeout(() => {
                costChart.classList.remove('loading');
                renderCostChart(data.data || []);
            }, 800);
        } else {
            console.error('Failed to fetch cost chart data:', response.statusText);
            // Clear chart data on error
            currentChartData = null;
            setTimeout(() => {
                costChart.classList.remove('loading');
                renderCostChart([]);
            }, 500);
        }
    } catch (error) {
        console.error('Error fetching user cost chart:', error);
        setTimeout(() => {
            costChart.classList.remove('loading');
            renderCostChart([]);
        }, 500);
    }
}

// Render the cost chart (24-hour or 7-day)
function renderCostChart(data) {
    const costChart = document.getElementById('cost-chart');
    const chartTotalValue = document.getElementById('chart-total-value');
    const chartLabelStart = document.getElementById('chart-label-start');
    const chartLabelEnd = document.getElementById('chart-label-end');
    
    if (!costChart || !chartTotalValue) return;
    
    // Calculate total cost
    let totalCost = 0;
    data.forEach(item => {
        totalCost += item.total_cost;
    });
    
    // Update total cost display with minus sign
    chartTotalValue.textContent = '-' + Math.round(totalCost).toString();
    
    // Update chart labels based on current view
    switch (currentChartView) {
        case 'day':
            chartLabelStart.textContent = '00:00';
            chartLabelEnd.textContent = '23:59';
            break;
        case 'week':
            chartLabelStart.textContent = 'Monday';
            chartLabelEnd.textContent = 'Sunday';
            break;
        case 'month':
            chartLabelStart.textContent = '1st';
            chartLabelEnd.textContent = 'End';
            break;
        default:
            chartLabelStart.textContent = '00:00';
            chartLabelEnd.textContent = '23:59';
    }
    
    // Find max cost for scaling
    const maxCost = Math.max(...data.map(h => h.total_cost), 1);
    
    // Clear existing bars
    costChart.innerHTML = '';
    
    // Create bars
    data.forEach((item, index) => {
        const bar = document.createElement('div');
        bar.className = 'cost-bar' + (item.total_cost === 0 ? ' zero' : '');
        
        // Calculate height (minimum 2px, maximum 100px)
        const heightPercent = item.total_cost === 0 ? 1 : Math.max(2, (item.total_cost / maxCost) * 100);
        bar.style.height = heightPercent + '%';
        
        // Create tooltip
        const tooltip = document.createElement('div');
        tooltip.className = 'cost-bar-tooltip';
        
        let timeStr, costStr;
        switch (currentChartView) {
            case 'day':
                // For day view, show hour
                const hourTime = new Date(item.hour);
                timeStr = hourTime.getHours().toString().padStart(2, '0') + ':00';
                break;
            case 'week':
                // For week view, show day
                const dayTime = new Date(item.day);
                timeStr = dayTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                break;
            case 'month':
                // For month view, show date
                const dateTime = new Date(item.day);
                timeStr = dateTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                break;
            default:
                const defaultTime = new Date(item.hour || item.day);
                timeStr = defaultTime.getHours ? defaultTime.getHours().toString().padStart(2, '0') + ':00' : defaultTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
        
        costStr = Math.round(item.total_cost).toString();
        tooltip.textContent = timeStr + ' | ' + costStr + ' PLN';
        
        bar.appendChild(tooltip);
        costChart.appendChild(bar);
    });
    
    // Update navigation button states after chart renders
    updateNavigationButtons();
}

// Show status
function showStatus(elementId, message, type) {
    const element = document.getElementById(elementId);
    if (!element) return;
    element.className = 'status ' + (type || 'info');
    element.innerHTML = message;
}

// Copy chart JSON data to clipboard
async function copyChartJson() {
    if (!currentChartData) {
        console.warn('No chart data available to copy');
        return;
    }

    try {
        // Extract only the data array from the response
        const dataTooCopy = currentChartData.data || [];
        const jsonString = JSON.stringify(dataTooCopy, null, 2);
        await navigator.clipboard.writeText(jsonString);
        
        // Show enhanced visual feedback
        const copyBtn = document.getElementById('copy-chart-json');
        if (copyBtn) {
            const originalTitle = copyBtn.title;
            
            // Add copied class for animated feedback
            copyBtn.classList.add('copied');
            copyBtn.title = '✓ Copied!';
            
            // Reset after animation
            setTimeout(() => {
                copyBtn.classList.remove('copied');
                copyBtn.title = originalTitle;
            }, 2000);
        }
        
        console.log('Chart JSON copied to clipboard');
    } catch (err) {
        console.error('Failed to copy chart JSON:', err);
        
        // Fallback: try to select text manually
        try {
            const dataTooCopy = currentChartData.data || [];
            const jsonString = JSON.stringify(dataTooCopy, null, 2);
            const textArea = document.createElement('textarea');
            textArea.value = jsonString;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            console.log('Chart JSON copied to clipboard (fallback)');
        } catch (fallbackErr) {
            console.error('Fallback copy also failed:', fallbackErr);
        }
    }
}
</script>`;
