// Import the HTML file directly
// In Cloudflare Workers, we can't use fs or path (Node.js modules)
// Instead, we'll include the HTML content directly
const TEST_CLIENT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pollinations.AI Auth</title>
    <style>
        /* Psychedelic Gen-Z style with minimal code */
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&display=swap');
        
        :root {
            --color-primary: #ff61d8;
            --color-secondary: #05ffa1;
            --color-accent: #ffcc00;
            --color-text: #000000;
            --color-bg: #ffffff;
        }
        
        * {
            box-sizing: border-box;
            transition: all 0.2s;
        }
        
        body { 
            font-family: 'Space Grotesk', sans-serif;
            max-width: 800px; 
            margin: 0 auto; 
            padding: 20px;
            background-color: var(--color-bg);
            color: var(--color-text);
            overflow-x: hidden;
        }
        
        .container { 
            background: white;
            padding: 30px; 
            border-radius: 16px;
            position: relative;
            border: 3px solid var(--color-primary);
            animation: border-shift 10s infinite linear;
        }
        
        @keyframes border-shift {
            0% { border-color: var(--color-primary); }
            33% { border-color: var(--color-secondary); }
            66% { border-color: var(--color-accent); }
            100% { border-color: var(--color-primary); }
        }
        
        h1, h2, h3 { 
            position: relative;
            z-index: 1;
        }
        
        h1 { 
            font-size: 2.5rem;
            margin-bottom: 1.5rem;
            font-weight: 700;
        }
        
        h1::after {
            content: "";
            position: absolute;
            width: 100%;
            height: 0.5em;
            bottom: 0.1em;
            left: 0;
            z-index: -1;
            background-color: var(--color-secondary);
            transform: skew(-15deg);
            animation: highlight-shift 8s infinite linear;
        }
        
        @keyframes highlight-shift {
            0% { background-color: var(--color-secondary); }
            33% { background-color: var(--color-accent); }
            66% { background-color: var(--color-primary); }
            100% { background-color: var(--color-secondary); }
        }
        
        h2 {
            font-size: 1.8rem;
            margin-top: 2rem;
            display: inline-block;
        }
        
        h3 {
            font-size: 1.4rem;
        }
        
        .production-badge { 
            background: var(--color-accent);
            color: black;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.7rem;
            font-weight: 700;
            letter-spacing: 1px;
            text-transform: uppercase;
            vertical-align: middle;
            animation: badge-shift 7s infinite linear;
        }
        
        @keyframes badge-shift {
            0% { background-color: var(--color-accent); }
            33% { background-color: var(--color-primary); }
            66% { background-color: var(--color-secondary); }
            100% { background-color: var(--color-accent); }
        }
        
        button { 
            background: var(--color-primary);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 30px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            margin-right: 10px;
            margin-bottom: 10px;
            font-family: 'Space Grotesk', sans-serif;
            position: relative;
            overflow: hidden;
            z-index: 1;
        }
        
        button::before {
            content: "";
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: var(--color-secondary);
            transition: left 0.3s ease;
            z-index: -1;
        }
        
        button:hover::before {
            left: 0;
        }
        
        .status { 
            margin-top: 20px;
            padding: 15px;
            border-radius: 12px;
            background: #f0f0f0;
            position: relative;
            overflow: hidden;
        }
        
        .status::before {
            content: "";
            position: absolute;
            top: 0;
            left: 0;
            width: 5px;
            height: 100%;
        }
        
        .success { background: white; }
        .success::before { background-color: var(--color-secondary); }
        
        .error { background: white; }
        .error::before { background-color: #ff3b5c; }
        
        .info { background: white; }
        .info::before { background-color: var(--color-accent); }
        
        input { 
            padding: 12px 16px;
            font-size: 1rem;
            border: 2px solid #ddd;
            border-radius: 30px;
            margin-right: 10px;
            width: 200px;
            font-family: 'Space Grotesk', sans-serif;
        }
        
        input:focus {
            outline: none;
            border-color: var(--color-primary);
            animation: input-focus 2s infinite alternate;
        }
        
        @keyframes input-focus {
            0% { border-color: var(--color-primary); }
            100% { border-color: var(--color-secondary); }
        }
        
        .hidden { display: none; }
        
        .input-group { 
            display: flex;
            align-items: center;
            margin-top: 10px;
        }
        
        .domain-item { 
            display: inline-flex;
            align-items: center;
            padding: 6px 12px;
            margin: 5px 5px 5px 0;
            font-weight: 600;
            position: relative;
            overflow: hidden;
            border-radius: 20px;
            background: white;
            border: 2px solid var(--color-accent);
            animation: domain-shift 8s infinite alternate;
        }
        
        .remove-btn {
            background: transparent;
            color: #ff3b5c;
            border: none;
            margin-left: 8px;
            padding: 0 6px;
            font-size: 16px;
            cursor: pointer;
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        }
        
        .remove-btn:hover {
            background: rgba(255, 59, 92, 0.1);
            transform: scale(1.2);
        }
        
        @keyframes domain-shift {
            0% { border-color: var(--color-accent); }
            50% { border-color: var(--color-primary); }
            100% { border-color: var(--color-secondary); }
        }
        
        code { 
            background: #f8f9fa;
            padding: 8px 12px;
            border-radius: 8px;
            font-family: monospace;
            display: inline-block;
            border: 1px solid #eee;
            color: var(--color-primary);
            margin: 5px 0;
            position: relative;
            overflow: hidden;
        }
        
        code::after {
            content: "";
            position: absolute;
            top: 0;
            left: -100%;
            width: 50%;
            height: 100%;
            background: rgba(255, 255, 255, 0.5);
            transform: skewX(-25deg);
            animation: code-shine 3s infinite;
        }
        
        @keyframes code-shine {
            0% { left: -100%; }
            20% { left: 200%; }
            100% { left: 200%; }
        }
        
        .emoji-title {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .emoji-title span {
            font-size: 24px;
            display: inline-block;
            animation: emoji-bounce 2s infinite alternate;
        }
        
        @keyframes emoji-bounce {
            0% { transform: translateY(0); }
            100% { transform: translateY(-5px); }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1 class="emoji-title"><span>🐝</span> Pollinations.AI Auth <span>🌸</span></h1>
        
        <div id="auth-section">
            <h2>✨ 1. Authentication</h2>
            <button id="auth-button" onclick="startAuth()">Login with GitHub</button>
            <button id="logout-button" onclick="logout()" class="hidden">Logout</button>
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
                
                // Toggle auth buttons
                document.getElementById('auth-button').classList.add('hidden');
                document.getElementById('logout-button').classList.remove('hidden');
                
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
                    
                    // Toggle auth buttons
                    document.getElementById('auth-button').classList.add('hidden');
                    document.getElementById('logout-button').classList.remove('hidden');
                    
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
                        '👤 Username: ' + data.username;
                    
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
        
        // Display domains with remove buttons
        function displayDomains() {
            let domainHtml = '';
            
            if (currentDomains.length > 0) {
                domainHtml = '<strong>🌐 Allowed Domains:</strong><div style="margin-top:10px">';
                for (const domain of currentDomains) {
                    // Properly escape the domain for use in the onclick attribute
                    const escapedDomain = domain.replace(/'/g, "\\'");
                    domainHtml += '<span class="domain-item">' + domain + 
                        ' <button class="remove-btn" onclick="removeDomain(\'' + escapedDomain + '\')">&times;</button></span>';
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
        
        // Remove domain
        async function removeDomain(domainToRemove) {
            if (!authToken || !userId) {
                showStatus('domain-info', '❌ Get user info first', 'error');
                return;
            }
            
            // Filter out the domain to remove
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
        
        // Logout function
        function logout() {
            // Clear stored data
            localStorage.removeItem('github_auth_token');
            localStorage.removeItem('github_username');
            localStorage.removeItem('github_user_id');
            
            // Reset variables
            authToken = null;
            userId = null;
            currentDomains = [];
            apiToken = null;
            
            // Update UI
            document.getElementById('auth-button').classList.remove('hidden');
            document.getElementById('logout-button').classList.add('hidden');
            document.getElementById('user-section').classList.add('hidden');
            document.getElementById('domain-section').classList.add('hidden');
            
            showStatus('auth-status', 'Logged out successfully', 'info');
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
