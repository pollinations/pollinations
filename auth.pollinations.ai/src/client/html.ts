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
        
        <details class="help-section" open>
            <summary><h2 style="display: inline;">💡 Quick Guide</h2></summary>
            <div class="help-content">
                <div class="help-item">
                    <h3>🔑 What's a Token?</h3>
                    <p>Think of it like your access key! 🎫 It lets you skip the queue and get instant access to our AI models. No more waiting!</p>
                    <div class="help-details">
                        <p><strong>How to use:</strong></p>
                        <ul>
                            <li>URL: <code>https://text.pollinations.ai/openai?token=YOUR_TOKEN</code></li>
                            <li>Header: <code>Authorization: Bearer YOUR_TOKEN</code></li>
                        </ul>
                    </div>
                </div>
                
                <div class="help-item">
                    <h3>🌐 What's a Referrer?</h3>
                    <p>It's basically where you're coming from! 📍 If your website is on our trusted list, you get priority access automatically. No token needed!</p>
                    <div class="help-details">
                        <p><strong>How it works:</strong></p>
                        <ul>
                            <li>We check your site's domain automatically</li>
                            <li>If you're on the allowlist = instant access ✨</li>
                            <li>Perfect for frontend apps (no backend needed!)</li>
                        </ul>
                    </div>
                </div>
                
                <div class="help-item">
                    <h3>🚀 Pro Tips</h3>
                    <ul class="pro-tips">
                        <li><span class="tip-emoji">💻</span> <strong>Web apps:</strong> Just add your domain to the allowlist!</li>
                        <li><span class="tip-emoji">⚡</span> <strong>Backend apps:</strong> Use tokens for Discord bots, AI chatbots, etc.</li>
                        <li><span class="tip-emoji">🔒</span> <strong>Keep it secret:</strong> Never share your token publicly!</li>
                    </ul>
                </div>
            </div>
        </details>
        
        <div id="auth-section">
            <h2>✨ 1. Authentication</h2>
            <button id="auth-button" onclick="startAuth()">Login with GitHub</button>
            <button id="logout-button" onclick="logout()" class="hidden">Logout</button>
            <div id="auth-status" class="status"></div>
        </div>
        
        <div id="user-section" class="hidden">
            <h2>👤 2. User Info</h2>
            <div id="user-info" class="status"></div>
            <div id="tier-section" class="tier-container hidden">
                <div class="tier-header">
                    <h3>✨ Your Tier:</h3>
                </div>
                <div class="tier-pills">
                    <div id="seed-pill" class="tier-pill seed">
                        <span class="tier-emoji">🌱</span> Seed
                    </div>
                    <div id="flower-pill" class="tier-pill flower">
                        <span class="tier-emoji">🌸</span> Flower
                    </div>
                    <div id="nectar-pill" class="tier-pill nectar">
                        <span class="tier-emoji">🍯</span> Nectar
                    </div>
                </div>
            </div>
        </div>
        
        <div id="domain-section" class="hidden">
            <h2>🌐 3. Referrer/Domain Management</h2>
            <p class="section-info">Add your website domains here for automatic priority access! No tokens needed for these sites.</p>
            <div class="input-group">
                <input type="text" id="new-domain" placeholder="example.com">
                <button onclick="addDomain()">Add Domain</button>
            </div>
            <div id="domain-info" class="status"></div>
            
            <h3>🔑 4. API Token Management</h3>
            <p class="section-info">Generate tokens for backend apps or when you need guaranteed access. Keep these secret! 🤫</p>
            <div id="token-info" class="status"><em>Loading token information...</em></div>
            <button onclick="generateApiToken()">Generate New Token</button>
        </div>
    </div>

    <footer style="text-align: center; padding: 20px; margin-top: 40px; font-size: 14px; opacity: 0.8;">
        <p>Need help? Check out our <a href="https://github.com/pollinations/pollinations/blob/master/APIDOCS.md" target="_blank" style="color: var(--color-primary);">API Documentation</a> 📚</p>
    </footer>

    ${JS}
</body>
</html>`;
