// HTML template for Pollinations.AI Auth client
import { CSS } from "./styles";
import { JS } from "./scripts";

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
        <h1 class="emoji-title">
            <img src="https://raw.githubusercontent.com/pollinations/pollinations/master/operations/assets/pollinations_ai_logo_black.svg" alt="Pollinations Logo" class="title-logo">
            <span></span>
            Pollinations.AI <br> 🐝 Auth 🌸
            <span></span>
        </h1>
        
        <!-- Intro section reserved for future announcements -->
        <div id="intro-section" class="intro-section"></div>

        <!-- 🔐 Authentication -->
        <div id="auth-section" style="margin-top: 40px;">
            <div id="auth-status" class="status hidden" style="margin-bottom: 12px;"></div>
            <button id="auth-button" onclick="startAuth()">Login with GitHub</button>
            <button id="logout-button" onclick="logout()" class="hidden">Logout</button>
        </div>

        <!-- 👤 Account Section -->
        <div id="account-section">
            <h2>👤 Account</h2>

            <div id="user-section" class="hidden">
                <!-- 🌟 Unified Profile Card -->
                <div id="profile-card" class="profile-card hidden">
                    <div id="user-info" class="status"></div>
                    <div id="tier-section" class="tier-container hidden">
                        <div class="tier-header">
                            <h3>✨ Tier</h3>
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

                <div id="preferences-section" class="preferences-container hidden">
                    <div class="preferences-header">
                        <h3>✨ Ads Settings ✨</h3>
                    </div>
                    <div class="preference-item">
                        <label for="ads-toggle" class="toggle-label">Show Ads</label>
                        <div class="toggle-switch">
                            <input type="checkbox" id="ads-toggle" onchange="toggleAdsPreference()">
                            <span class="toggle-slider"></span>
                        </div>
                        <span id="ads-status" class="preference-status">Loading...</span>
                    </div>
                    <div class="preference-info">
                        <p>💯 Enabling ads will help you level up to higher tiers - no cap!</p>
                        <p>👀 Want credit card payments instead? <a href="https://github.com/pollinations/pollinations/issues/2202" target="_blank">Drop a 👍 on this issue</a> to vote!</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- 🔑 Whitelist Section -->
        <div id="whitelist-section">
            <h2>🔑 Access</h2>
            <div id="domain-section" class="hidden">
                <div class="access-card">
                                <h3>Referrer / Domain</h3>

                    <p class="section-info">Add your website domains here for automatic tier access! No tokens needed for these sites.</p>

                    <div class="input-group">
                        <input type="text" id="new-domain" placeholder="example.com">
                        <button onclick="addDomain()">Add Domain</button>
                    </div>
                    <div id="domain-info" class="status"></div>
                </div>
                <details class="help-block" open>
                    <summary>🌐 What's a Referrer?</summary>
                    <p>It's basically where you're coming from! 📍 If your website is on our trusted list, you get priority access automatically. No token needed!</p>
                    <ul>
                        <li>We check your site's domain automatically</li>
                        <li>If you're on the allowlist = instant access ✨</li>
                        <li>Perfect for frontend apps (no backend needed!)</li>
                    </ul>
                    <p><strong>💻 Web apps:</strong> Just add your domain to the allowlist!</p>
                </details>

                <div class="access-card">
                                <h3>API Token</h3>

                    <p class="section-info">Generate tokens for backend apps or when you need guaranteed access. Keep these secret! 🤫</p>

                    <div id="token-info" class="status"><em>Loading token information...</em></div>
                    <button onclick="generateApiToken()">Generate New Token</button>
                </div>
                <details class="help-block" open>
                    <summary>🔑 What's a Token?</summary>
                    <p>Think of it like your access key! 🎫 It lets you skip the queue and get instant access to our AI models. No more waiting!</p>
                    <p><strong>How to use:</strong></p>
                    <code>URL: https://text.pollinations.ai/openai?token=YOUR_TOKEN</code><br>
                    <code>Header: Authorization: Bearer YOUR_TOKEN</code>
                    <p><strong>⚡ Backend apps:</strong> Use tokens for Discord bots, AI chatbots, etc.</p>
                    <p><strong>🔒 Keep it secret:</strong> Never share your token publicly!</p>
                </details>
            </div>
        </div>
    </div>

    <footer style="text-align: center; padding: 20px; margin-top: 40px; font-size: 14px; opacity: 0.8;">
        <p>Need help? Check out our <a href="https://github.com/pollinations/pollinations/blob/master/APIDOCS.md" target="_blank" style="color: var(--color-primary);">API Documentation</a> 📚</p>
    </footer>

    ${JS}
</body>
</html>`;
