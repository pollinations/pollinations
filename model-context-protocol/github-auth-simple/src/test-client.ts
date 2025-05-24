// Test client HTML - simplified to avoid TypeScript compilation issues
const TEST_CLIENT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GitHub Auth Test Client</title>
    <style>
        body { font-family: -apple-system, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; background: #f5f5f5; }
        .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1, h2, h3 { color: #333; }
        .production-badge { background: #28a745; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; margin-left: 10px; }
        button { background: #24292e; color: white; border: none; padding: 12px 24px; border-radius: 6px; font-size: 16px; cursor: pointer; margin-right: 10px; margin-bottom: 10px; }
        button:hover { background: #1a1e22; }
        .status { margin-top: 20px; padding: 15px; border-radius: 6px; background: #f0f0f0; }
        .success { background: #d4edda; color: #155724; }
        .error { background: #f8d7da; color: #721c24; }
        .info { background: #d1ecf1; color: #0c5460; }
        input { padding: 8px 12px; font-size: 14px; border: 1px solid #ddd; border-radius: 4px; margin-right: 10px; width: 200px; }
        .hidden { display: none; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔐 GitHub Auth Test Client <span class="production-badge">BUILT-IN</span></h1>
        
        <div id="auth-section">
            <h2>1. Authentication</h2>
            <button onclick="startAuth()">Login with GitHub</button>
            <div id="auth-status" class="status"></div>
        </div>
        
        <div id="user-section" class="hidden">
            <h2>2. User Info</h2>
            <button onclick="getUserInfo()">Get User Info</button>
            <div id="user-info" class="status"></div>
        </div>
        
        <div id="domain-section" class="hidden">
            <h2>3. Domain Management</h2>
            <button onclick="getDomains()">Get Domain List</button>
            <input type="text" id="new-domain" placeholder="example.com">
            <button onclick="addDomain()">Add Domain</button>
            <div id="domain-info" class="status"></div>
            
            <h3>4. Check Domain</h3>
            <input type="text" id="check-domain" placeholder="example.com">
            <button onclick="checkDomain()">Check Domain</button>
            <div id="check-result" class="status"></div>
        </div>
    </div>

    <script>
        // Global variables
        const API_BASE = window.location.origin;
        let authToken = null;
        let userId = null;
        let currentDomains = [];
        
        // Initialize on page load
        window.addEventListener('load', function() {
            const params = new URLSearchParams(window.location.search);
            const token = params.get('token');
            const username = params.get('username');
            
            if (token && username) {
                // Store token and show success message
                authToken = token;
                showStatus('auth-status', '✅ Authenticated as ' + username, 'success');
                
                // Show user section and domain section
                document.getElementById('user-section').classList.remove('hidden');
                document.getElementById('domain-section').classList.remove('hidden');
                
                // Store in localStorage for persistence
                localStorage.setItem('github_auth_token', token);
                localStorage.setItem('github_username', username);
                
                // Clean up URL
                window.history.replaceState({}, document.title, window.location.pathname);
            } else {
                // Check for stored token
                const storedToken = localStorage.getItem('github_auth_token');
                const storedUsername = localStorage.getItem('github_username');
                
                if (storedToken && storedUsername) {
                    authToken = storedToken;
                    showStatus('auth-status', '✅ Authenticated as ' + storedUsername, 'success');
                    document.getElementById('user-section').classList.remove('hidden');
                    document.getElementById('domain-section').classList.remove('hidden');
                }
            }
        });
        
        // Start authentication
        function startAuth() {
            const redirectUri = encodeURIComponent(API_BASE + '/test-client');
            window.location.href = API_BASE + '/authorize?redirect_uri=' + redirectUri;
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
                    
                    let userHtml = '<strong>User Info:</strong><br>';
                    userHtml += 'ID: ' + data.github_user_id + '<br>';
                    userHtml += 'Username: ' + data.username + '<br>';
                    userHtml += '<small>(Note: This is a simplified auth service - only basic user info is stored)</small>';
                    
                    showStatus('user-info', userHtml, 'success');
                    
                    // Show domain section
                    document.getElementById('domain-section').classList.remove('hidden');
                    
                    // Automatically fetch domains
                    getDomains();
                } else {
                    showStatus('user-info', '❌ Error: ' + response.statusText, 'error');
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
                    showStatus('domain-info', '❌ Error: ' + response.statusText, 'error');
                }
            } catch (error) {
                showStatus('domain-info', '❌ Error: ' + error.message, 'error');
            }
        }
        
        // Display domains
        function displayDomains() {
            let domainHtml = '';
            
            if (currentDomains.length > 0) {
                domainHtml = '<strong>Allowed Domains:</strong><br>';
                for (const domain of currentDomains) {
                    domainHtml += '• ' + domain + '<br>';
                }
            } else {
                domainHtml = '<em>No domains allowed yet</em>';
            }
            
            showStatus('domain-info', domainHtml, 'info');
        }
        
        // Add domain
        async function addDomain() {
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
                    showStatus('domain-info', '✅ Added ' + domain, 'success');
                } else {
                    showStatus('domain-info', '❌ Error: ' + response.statusText, 'error');
                }
            } catch (error) {
                showStatus('domain-info', '❌ Error: ' + error.message, 'error');
            }
        }
        
        // Check domain
        async function checkDomain() {
            const domain = document.getElementById('check-domain').value.trim();
            if (!domain) {
                showStatus('check-result', '❌ Please enter a domain', 'error');
                return;
            }
            
            if (!userId) {
                showStatus('check-result', '❌ Get user info first', 'error');
                return;
            }
            
            try {
                const response = await fetch(API_BASE + '/api/check-domain?user_id=' + userId + '&domain=' + encodeURIComponent(domain));
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.allowed) {
                        showStatus('check-result', '✅ ' + domain + ' is allowed', 'success');
                    } else {
                        showStatus('check-result', '❌ ' + domain + ' is not allowed', 'error');
                    }
                } else {
                    showStatus('check-result', '❌ Error: ' + response.statusText, 'error');
                }
            } catch (error) {
                showStatus('check-result', '❌ Error: ' + error.message, 'error');
            }
        }
        
        // Show status
        function showStatus(elementId, message, type) {
            const element = document.getElementById(elementId);
            element.className = 'status ' + (type || 'info');
            element.innerHTML = message;
        }
    </script>
</body>
</html>`;

module.exports = { TEST_CLIENT_HTML };
