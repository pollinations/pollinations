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
let username = null; 
const IS_DEV = false;
let baseURL = "https://llm-tracker.tinybird.live/?token=p.eyJ1IjogIjY2ZTg5NDU1LTAzYTgtNGZkNS1iNjg3LWU5NDdhMzY5OThkMyIsICJpZCI6ICIwODdkZDljOC1lZmFmLTRkNjYtOWY2MS1hODEwNDc4ZWI5YjAiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.GvOkurXB57lHOfX9OWcS30PNnKJXpKn0_ecVGgEAe7k&start_date=2025-05-15+10%3A24%3A53&end_date=2025-06-14+10%3A24%3A53&dimension=user&user=";
let usageBtn = document.getElementById('usage-container');


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
    username = params.get('username'); 
    

       // ...existing code...
    if (IS_DEV) {
        // Fake authentication for dev
        authToken = "abcdef1234567890"; 
        userId = "44115";
        username = "dev-user"; 
        showStatus('auth-status', '✅ Dev Authenticated as ' + username + ' 🎉', 'success');
        document.getElementById('user-section').classList.remove('hidden');
        document.getElementById('domain-section').classList.remove('hidden');
        document.getElementById('auth-button').classList.add('hidden');
        document.getElementById('logout-button').classList.remove('hidden');
        const userHtml = '<div class="profile-badge">' +
              '<span class="gh-icon">🐙</span>' +
              '<span class="username">@dev-user</span>' +
              '<span class="user-id">#44115</span>' +
            '</div>';
        const badgeEl = document.getElementById('badge-container');
        if (badgeEl) {
        badgeEl.innerHTML = userHtml;
        badgeEl.classList.remove('hidden');
        }
        usageURL = baseURL + encodeURIComponent("Circuit-Overtime"); // i did it for testing purposes
        usageBtn.setAttribute('data-id', usageURL);
        if (usageBtn && usageBtn.dataset.id) {
        usageBtn.addEventListener('click', function() {
            window.location.href = usageBtn.dataset.id;
        });
        }  
        else if (usageBtn && !usageBtn.dataset.id) {
            alert("Client Token is not set.");
        }
        document.getElementById('usage-container').classList.remove('hidden');
        currentDomains = ['localhost:3000', 'dev.example.com'];
        displayDomains();
        apiToken = 'dev-api-token-123';
        showStatus('token-info', '<code class="token-value copyable" id="api-token-value" onclick="copyApiToken()" title="Click to copy">' + apiToken + '</code>', 'info');
        userTier = 'seed';
        updateTierDisplay();
        userPreferences = { show_ads: true };
        updateAdsToggleUI();
        const introEl = document.getElementById('intro-text');
        if (introEl) introEl.classList.add('hidden');
       
        return; // Skip real auth and API calls
    }


    if (token && username) {
        // Store token and show success message
        authToken = token;
        showStatus('auth-status', '✅ Authenticated as ' + username + ' 🎉', 'success');
        document.getElementById('user-section').classList.remove('hidden');
        document.getElementById('domain-section').classList.remove('hidden');
        // Toggle auth/logout buttons
        document.getElementById('auth-button').classList.add('hidden');
        document.getElementById('logout-button').classList.remove('hidden');
        localStorage.setItem('github_auth_token', token);
        localStorage.setItem('github_username', username);
        localStorage.setItem('github_user_id', params.get('user_id') || '');
        usageURL = baseURL + encodeURIComponent(username);
        usageBtn.setAttribute('data-id', usageURL);
        if (usageBtn && usageBtn.dataset.id) {
        usageBtn.addEventListener('click', function() {
            window.location.href = usageBtn.dataset.id;
        });
        }  
        else if (usageBtn && !usageBtn.dataset.id) {
            alert("Client Token is not set.");
        }
        document.getElementById('usage-container').classList.remove('hidden');
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Automatically load user info, domains, token and preferences
        userId = params.get('user_id');
        getUserInfo();
        getDomains();
        getApiToken();
        getUserPreferences();
        // Hide intro text when user is logged in
        const introEl = document.getElementById('intro-text');
        if (introEl) introEl.classList.add('hidden');
    } else {
       
        const storedToken = localStorage.getItem('github_auth_token');
        const storedUsername = localStorage.getItem('github_username');
        
        if (storedToken && storedUsername) {
            authToken = storedToken;
            userId = localStorage.getItem('github_user_id');
            showStatus('auth-status', '✅ Authenticated as ' + storedUsername + ' 🎉', 'success');
            
            // Toggle auth/logout buttons
            document.getElementById('auth-button').classList.add('hidden');
            document.getElementById('logout-button').classList.remove('hidden');
            
            document.getElementById('user-section').classList.remove('hidden');
            document.getElementById('domain-section').classList.remove('hidden');
            usageURL = baseURL + encodeURIComponent(storedUsername); 
            usageBtn.setAttribute('data-id', usageURL);
            if (usageBtn && usageBtn.dataset.id) {
            usageBtn.addEventListener('click', function() {
                window.location.href = usageBtn.dataset.id;
            });
            }  
            else if (usageBtn && !usageBtn.dataset.id) {
                alert("Client Token is not set.");
            }
            document.getElementById('usage-container').classList.remove('hidden');
            // Automatically load user info, domains, token and preferences
            getUserInfo();
            getDomains();
            getApiToken();
            getUserPreferences();
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
    document.getElementById('usage-container').classList.add('hidden');
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
    document.getElementById('usage-container').classList.add('hidden');
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
            
            usageURL = baseURL + encodeURIComponent(username);
            usageBtn.setAttribute('data-id', usageURL);
            if (usageBtn && usageBtn.dataset.id) {
                usageBtn.addEventListener('click', function() {
                    window.location.href = usageBtn.dataset.id;
                });
            }  
            else if (usageBtn && !usageBtn.dataset.id) {
                alert("Client Token is not set.");
            }
            // Optionally clear the old user-info badge
            showStatus('user-info', '', 'info');
            
            // Now that we have the user ID, get domains and token
            getDomains();
            getApiToken();
            getUserTier();
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

// Show status
function showStatus(elementId, message, type) {
    const element = document.getElementById(elementId);
    if (!element) return;
    element.className = 'status ' + (type || 'info');
    element.innerHTML = message;
}
</script>`;
