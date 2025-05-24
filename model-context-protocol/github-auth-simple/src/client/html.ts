// HTML template for Pollinations.AI Auth client
import { CSS } from './styles';
import { JS } from './scripts';

export const generateHTML = () => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pollinations.AI Auth</title>
    <style>
        ${CSS}
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
            <h2>🌐 3. Referrer/Domain Management</h2>
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

    ${JS}
</body>
</html>`;
