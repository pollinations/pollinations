// Test client HTML - simplified to avoid TypeScript compilation issues
const TEST_CLIENT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pollinations.AI Auth</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Maven+Pro:wght@400..900&display=swap');
        
        :root {
            --pollinations-purple: #8A56AC;
            --pollinations-pink: #FF6B98;
            --pollinations-yellow: #FFD166;
            --pollinations-green: #06D6A0;
            --pollinations-blue: #118AB2;
        }
        
        body { 
            font-family: 'Maven Pro', sans-serif; 
            max-width: 800px; 
            margin: 50px auto; 
            padding: 20px; 
            background: #f8f9fa; 
            color: #333;
        }
        
        .container { 
            background: white; 
            padding: 30px; 
            border-radius: 16px; 
            box-shadow: 0 4px 20px rgba(138, 86, 172, 0.15); 
            border-top: 5px solid var(--pollinations-purple);
        }
        
        h1, h2, h3 { 
            color: var(--pollinations-purple); 
            font-weight: 600;
        }
        
        h1 { font-size: 28px; }
        h2 { font-size: 22px; margin-top: 30px; }
        h3 { font-size: 18px; }
        
        .production-badge { 
            background: var(--pollinations-green); 
            color: white; 
            padding: 4px 8px; 
            border-radius: 20px; 
            font-size: 12px; 
            margin-left: 10px; 
        }
        
        button { 
            background: var(--pollinations-purple); 
            color: white; 
            border: none; 
            padding: 12px 24px; 
            border-radius: 30px; 
            font-size: 16px; 
            cursor: pointer; 
            margin-right: 10px; 
            margin-bottom: 10px; 
            transition: all 0.2s ease;
            font-family: 'Maven Pro', sans-serif;
        }
        
        button:hover { 
            background: var(--pollinations-pink); 
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        }
        
        .status { 
            margin-top: 20px; 
            padding: 15px; 
            border-radius: 12px; 
            background: #f0f0f0; 
        }
        
        .success { background: #d4edda; color: #155724; border-left: 4px solid var(--pollinations-green); }
        .error { background: #f8d7da; color: #721c24; border-left: 4px solid #dc3545; }
        .info { background: #d1ecf1; color: #0c5460; border-left: 4px solid var(--pollinations-blue); }
        
        input { 
            padding: 12px 16px; 
            font-size: 14px; 
            border: 2px solid #ddd; 
            border-radius: 30px; 
            margin-right: 10px; 
            width: 200px; 
            transition: all 0.2s ease;
            font-family: 'Maven Pro', sans-serif;
        }
        
        input:focus {
            border-color: var(--pollinations-purple);
            outline: none;
            box-shadow: 0 0 0 3px rgba(138, 86, 172, 0.2);
        }
        
        .hidden { display: none; }
        
        .input-group { 
            display: flex; 
            align-items: center; 
            margin-top: 10px; 
        }
        
        .domain-item { 
            background: var(--pollinations-yellow); 
            color: #333;
            padding: 6px 12px; 
            border-radius: 20px; 
            margin: 5px 5px 5px 0; 
            display: inline-block; 
            font-weight: 500;
        }
        
        code { 
            background: #f8f9fa; 
            padding: 8px 12px; 
            border-radius: 8px; 
            font-family: monospace; 
            display: inline-block;
            border: 1px solid #eee;
            color: var(--pollinations-purple);
            margin: 5px 0;
        }
        
        .emoji-title {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .emoji-title span {
            font-size: 24px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1 class="emoji-title"><span>🐝</span> Pollinations.AI Auth <span>🌸</span> <span class="production-badge">BUILT-IN</span></h1>
        
        <div id="auth-section">
            <h2>✨ 1. Authentication</h2>
            <button onclick="startAuth()">Login with GitHub</button>
            <div id="auth-status" class="status"></div>
        </div>
        
        <div id="user-section" class="hidden">
            <h2>👤 2. User Info</h2>
            <div id="user-info" class="status"></div>
        </div>
        
        <div id="domain-section" class="hidden">
            <h2>🌐 3. Domain Management</h2>
            <div class="input-group">
                <input type="text" id="new-domain" placeholder="example.com">
                <button onclick="addDomain()">Add Domain</button>
            </div>
            <div id="domain-info" class="status"></div>
            
            <h3>🔑 4. API Token Management</h3>
            <div id="token-info" class="status"><em>Loading token information...</em></div>
            <button onclick="generateApiToken()">Generate New Token</button>
        </div>
    </div>

    <script>
        // Global variables
        const API_BASE = window.location.origin;
        let authToken = null;
        let userId = null;
        let currentDomains = [];
        let apiToken = null;
        
        // Initialize on page load
        window.addEventListener('load', function() {
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
                
                // Store in localStorage for persistence
                localStorage.setItem('github_auth_token', token);
                localStorage.setItem('github_username', username);
                localStorage.setItem('github_user_id', params.get('user_id') || '');
                
                // Clean up URL
                window.history.replaceState({}, document.title, window.location.pathname);
                
                // Automatically load user info, domains and token
                userId = params.get('user_id');
                getUserInfo();
                getDomains();
                getApiToken();
            } else {
                // Check for stored token
                const storedToken = localStorage.getItem('github_auth_token');
                const storedUsername = localStorage.getItem('github_username');
                
                if (storedToken && storedUsername) {
                    authToken = storedToken;
                    userId = localStorage.getItem('github_user_id');
                    showStatus('auth-status', '✅ Authenticated as ' + storedUsername + ' 🎉', 'success');
                    
                    document.getElementById('user-section').classList.remove('hidden');
                    document.getElementById('domain-section').classList.remove('hidden');
                    
                    // Automatically load user info, domains and token
                    getUserInfo();
                    getDomains();
                    getApiToken();
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
                    
                    let userHtml = '<strong>User Info:</strong><br>' +
                        '🆔 ID: ' + data.github_user_id + '<br>' +
                        '👤 Username: ' + data.username + '<br>' +
                        '<em>(Note: This is a simplified auth service - only basic user info is stored)</em>';
                    
                    showStatus('user-info', userHtml, 'info');
                    
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
                domainHtml = '<strong>🌐 Allowed Domains:</strong><div style="margin-top:10px">';
                for (const domain of currentDomains) {
                    domainHtml += '<span class="domain-item">' + domain + '</span>';
                }
                domainHtml += '</div>';
            } else {
                domainHtml = '<em>No domains allowed yet</em> 🔍';
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
                    document.getElementById('new-domain').value = '';
                    // No need for additional success message as the domain list is already updated
                } else {
                    showStatus('domain-info', '❌ Error: ' + response.statusText, 'error');
                }
            } catch (error) {
                showStatus('domain-info', '❌ Error: ' + error.message, 'error');
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
                        showStatus('token-info', '<strong>🔑 Your API Token:</strong><br><code>' + apiToken + '</code>', 'info');
                    } else {
                        showStatus('token-info', '⚠️ No API token found. Generate one first! 🔄', 'info');
                    }
                } else {
                    showStatus('token-info', '❌ Error: ' + response.statusText, 'error');
                }
            } catch (error) {
                showStatus('token-info', '❌ Error: ' + error.message, 'error');
            }
        }
        
        // Generate API token
        async function generateApiToken() {
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
                    
                    showStatus('token-info', '<strong>✅ New API Token Generated:</strong><br><code>' + apiToken + '</code><br><em>Save this token! It will not be shown again.</em> 🔐', 'success');
                } else {
                    showStatus('token-info', '❌ Error: ' + response.statusText, 'error');
                }
            } catch (error) {
                showStatus('token-info', '❌ Error: ' + error.message, 'error');
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
