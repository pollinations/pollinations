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
            <span class="brand">
                <img src="https://raw.githubusercontent.com/pollinations/pollinations/master/operations/assets/pollinations_ai_logo_black.svg" alt="Pollinations Logo" class="title-logo" />
                Pollinations.AI
            </span>
            <span class="auth-title">🐝 Auth 🌸</span>
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
            <div id="user-section" class="hidden">
                <!-- 🌟 Tier Section -->
                <div id="tier-section" class="tier-container hidden">
                    <div class="tier-header">
                        <h2>✨ Tier</h2>
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
                        <p>
                            <span style="font-size:1.2em;"></span>
                            <b><i>Want to <span style="color:black;">upgrade</span> to <span style="color:#ff61d8;">Flower</span> or <span style="color:#ffb300;">Nectar</span> tier?</i></b>
                            <br>
                            <br>
                            <a href="https://github.com/pollinations/pollinations/blob/master/.github/ISSUE_TEMPLATE/special-bee-request.yml" target="_blank" class="cta-hole">Request access!</a>
                        </p>
                    </div>
                </div>

                <div id="preferences-section" class="preferences-container hidden">
                    <div class="preferences-header">
                        <h2>🪧 Ads</h2>
                    </div>
                    <p>Enabling ads will help you level up to higher tiers (beta). When activated, contextual ads are added to a percentage of Pollinations.AI's GenAI API responses.</p>
                    <div class="preference-item">
                        <label for="ads-toggle" class="toggle-label">Show Ads</label>
                        <div class="toggle-switch">
                            <input type="checkbox" id="ads-toggle" onchange="toggleAdsPreference()">
                            <span class="toggle-slider"></span>
                        </div>
                        <span id="ads-status" class="preference-status">Loading...</span>
                    </div>

                    <p><b><i>Want credit card payments instead?</i></b> 💳 
                    <br>
                    <br>
                    <a href="https://github.com/pollinations/pollinations/issues/2202" target="_blank" class="cta-hole">Drop a vote!</a></p>
                </div>
            </div>
        </div>

        <!-- 🔑 Allowed Section -->
        <div id="whitelist-section">
            <div id="domain-section" class="hidden">
                <div class="access-card">
                    <h2>🔑 Referrer / Domain</h2>
                    <p class="section-info">Enter the primary domain or referrer your app calls from. Your tier activates immediately for the traffic from that domain.</p>
                    <div class="input-group">
                        <input type="text" id="new-domain" placeholder="example.com">
                        <button onclick="addDomain()">Add</button>
                    </div>
                    <div id="domain-info" class="status"></div>
                </div>
                <details class="help-block" open>
                    <summary>
                        <span style="font-size:1.1em;">🤔</span>
                        <b>Referrer <span style="color:#888;">vs</span> Domain</b>
                        <span style="font-size:1.1em;"></span>
                    </summary>
                    <div style="margin: 18px 0 10px 0;">
                        <ul style="margin-bottom: 16px; line-height: 1.7;">
                            <li>
                                <b style="color:#3a3a3a;">Referrer</b>
                                <span style="color:#888;">(for browser apps):</span>
                                <br>
                                <span style="margin-left:1.2em; display:inline-block;">
                                    When your <b>front-end</b> (browser) calls the API directly.<br>
                                    <span style="color:#666;">
                                        <i>
                                            To find your referrer: <br>
                                            1. Open your browser's developer tools (usually F12 or right-click → Inspect).<br>
                                            2. Go to the <b>Network</b> tab.<br>
                                            3. Make an API request from your app.<br>
                                            4. Click the request and look for the <b>Referer</b> header—this is your referrer URL.
                                        </i>
                                    </span>
                                </span>
                            </li>
                            <li style="margin-top:12px;">
                                <b style="color:#3a3a3a;">Domain</b>
                                <span style="color:#888;">(for backend/server):</span>
                                <br>
                                <span style="margin-left:1.2em; display:inline-block;">
                                    When your <b>server</b> or <b>edge function</b> makes the call.<br>
                                    <span style="color:#666;">We match the main site address to your tier.</span>
                                </span>
                            </li>
                        </ul>
                    </div>
                </details>

                <div class="access-card">
                    <h2>🔑 API Token</h2>

                    <p class="section-info">Generate a secure, private token for your backend or server-side integrations.</p>
                    <p><strong>🔒 Keep it secret:</strong> Never share your token publicly!</p>

                    <div id="token-info" class="status"><em>Loading token information...</em></div>
                    <button onclick="generateApiToken()">Generate New Token</button>
                                    
                </div>
                <details class="help-block" open>
                    <summary>🤔 What's a Token? </summary>
                    <p>
                        <span style="font-size:1.2em;">🎫</span>
                        <i>Your personal key </i>for  <i>access</i> to our Gen AI models.<br>
                    </p>
                    <p>
                        <b><i>🔧 How to use:</i></b>
                    </p>
                    <code>🌐 URL: <b>https://text.pollinations.ai/openai?token=YOUR_TOKEN</b></code><br>
                    <code>🛡️ Header: <b>Authorization: Bearer YOUR_TOKEN</b></code>
                    <p>
                        <span style="font-size:1.1em;">🤖</span>
                        <b><i>Perfect for backend apps:</i></b> Use tokens for <b>Discord bots</b>, <b>AI chatbots</b>, and more!
                    </p>
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
