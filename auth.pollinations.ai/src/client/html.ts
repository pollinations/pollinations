// HTML template for Pollinations.AI Auth client
import { CSS } from "./styles";
import { JS } from "./scripts";

export const generateHTML = () => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pollinations.AI Auth</title>
    <link rel="shortcut icon" href="/favicon.ico" type="image/x-icon">
    <link rel="icon" href="/media/favicon-32x32.png" sizes="32x32" type="image/png">
    <link rel="icon" href="/media/favicon-16x16.png" sizes="16x16" type="image/png">
    <link rel="apple-touch-icon" href="/media/apple-touch-icon.png" sizes="180x180">
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
        <div id="auth-section" style="margin-top: 40px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <button id="auth-button" onclick="startAuth()">Login with GitHub</button>
            <button id="logout-button" onclick="logout()" class="hidden">Logout</button>
            <div id="badge-container" class="hidden"></div>
        </div>

        <!-- 👤 Account Section -->
        <div id="account-section">
            <h2>👤 Creator Account</h2>

            <div id="user-section" class="hidden">
                <!-- 🌟 Tier Section -->
                <div id="tier-section" class="tier-container hidden">
                    <div class="tier-header">
                        <h3>✨ Tier</h3>
                    </div>
                    <div class="tier-description">
                        <p>Seed tier is automatic on first login. Flower and Nectar are assigned in limited pilots while we're in beta. Higher tiers give you more Gen‑AI usage.</p>
                    </div>
                    <h4>Current:</h4>
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
                        <p>Want to upgrade to Flower or Nectar tier? <a href="https://github.com/pollinations/pollinations/blob/master/.github/ISSUE_TEMPLATE/special-bee-request.yml" target="_blank">Apply here</a> to request access!</p>
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
                        <p>💯 <b><i>Enabling ads</i></b> will help you <b><i>level up</i></b> to higher tiers <b>– <span style="color:#ff61d8;">no cap</span>!</b> 🚀🌟</p>
                        <p>👀 <b><i>Want credit card payments instead?</i></b> 💳 <a href="https://github.com/pollinations/pollinations/issues/2202" target="_blank"><b>Drop a 👍 on this issue</b></a> to vote! 🗳️</p>
                </div>
            </div>
        </div>

        <!-- 🔑 Whitelist Section -->
        <div id="whitelist-section">
            <div id="domain-section" class="hidden">
                <div class="access-card">
                    <h3>🔑 Referrer / Domain</h3>
                    <p class="section-info">Enter the primary domain or referrer your app calls from. Your tier activates immediately for traffic from that domain. Ideal for front-end web apps.</p>
                    <div class="input-group">
                        <input type="text" id="new-domain" placeholder="example.com">
                        <button onclick="addDomain()">Add</button>
                    </div>
                    <div id="domain-info" class="status"></div>
                </div>
                <details class="help-block" open>
                    <summary>🌐 What's a Referrer?</summary>
                    <p>It's basically where you're coming from! 📍 If your website is on our trusted list, you get priority access automatically. No token needed!</p>
                    <ul>
                        <li>We verify your site's domain automatically</li>
                        <li>If you have its referrer or domain registered = instant access ✨</li>
                        <li>Perfect for <strong>💻 Web apps</strong> (no backend needed!)</li>
                    </ul>
                </details>

                <div class="access-card">
                                <h3>🔑 API Token</h3>

                    <p class="section-info">Generate a secret token for backend or server‑side integrations.</p>
                    <p><strong>🔒 Keep it secret:</strong> Never share your token publicly!</p>

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
