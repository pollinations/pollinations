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
        
        <!-- Intro section with tagline (visible only when logged out) -->
        <div id="intro-text">
            <div style="font-size: 1.25em; color: #222; margin-top: 8px;">
                <span style="background: #fffbe7; border-radius: 6px; padding: 2px 8px;">
                    <b>Sign in</b> to unlock <span style="color: #ffb300; font-weight: bold;">all models &amp; features</span>
                </span>
            </div>
            <div style="margin-top: 10px; font-size: 1.1em; color: #444;">
                <span style="display: inline-block; background: #ffe3fa; border-radius: 6px; padding: 2px 10px;">
                    <b>Free</b> &nbsp;|&nbsp; <b>Anonymous</b> 
                </span>
            </div>
            <div style="margin-top: 12px; font-size: 1.05em; color: #7a3cff;">
                <i>Gen-AI API for everyone <span style="font-size:1.2em;">🌟</span></i>
            </div>
        </div>

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
                        <p>
                            <span style="color:#2ecc40; font-weight:bold;">Seed</span> tier is <span style="font-style:italic;"><b>automatic</b></span> on first login.<br>
                            <span style="color:#ff61d8; font-weight:bold;">Flower</span> and <span style="color:#ffb300; font-weight:bold;">Nectar</span> are assigned in <span style="font-weight:bold; text-decoration:underline dotted #ff61d8;">limited pilots</span> while we're in <span style="color:#7a3cff; font-style:italic;"><b>beta</b></span>.<br>
                            <span style="font-weight:bold; color:#ffb300;">Higher tiers</span> = <span style="font-style:italic;">more Gen‑AI usage</span>!
                        </p>
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


                        <div>
                            <span style="color:#444;">
                                    <span style="color:#444;">
                                        <b>When active, anonymous contextual ads</b> are be added in some GenAI API responses. 
                                    </span>
           

            
                    </div>
                    <div class="preference-item">
                        <label for="ads-toggle" class="toggle-label">Show Ads</label>
                        <div class="toggle-switch">
                            <input type="checkbox" id="ads-toggle" onchange="toggleAdsPreference()">
                            <span class="toggle-slider"></span>
                        </div>
                        <span id="ads-status" class="preference-status">Loading...</span>
                    </div><br>
                            <span style="color:#7a3cff; font-weight:bold; font-style:italic;">
                                🚀 Beta Perk: <span style="color:#ff61d8;">Level up faster</span> — <span style="color:#444;">More Ads</span> <span style="color:#ffb300;">= Higher Tier</span>
                            </span>
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
                    <p class="section-info" style="font-style:italic; font-weight:500; color:#6c2cff;">
                        <span style="font-weight:700; color:black;">Enter the primary </span>
                        <span style="font-weight:700; color:#ff61d8; font-style:italic;">domain</span>
                        <span style="color:#444;"> or </span>
                        <span style="font-weight:700; color:#ffb300;">referrer</span>
                        <span style="color:#444;"> your app calls from.<br>
                        <span style="font-weight:600; color:#3a3a3a;">Your tier activates immediately</span>
                        <span style="color:#888;"> for the traffic from that domain.</span>
                    </p>
                    <div class="input-group">
                        <input type="text" id="new-domain" placeholder="example.com">
                        <button onclick="addDomain()">Add</button>
                    </div>
                    <div id="domain-info" class="status"></div>
                </div>
                <details class="help-block">
                    <summary>
                        <span style="font-size:1.1em;">🤔</span>
                        <b>Referrer <span style="color:#d7263d;">vs</span> Domain</b>
                        <span style="font-size:1.1em;"></span>
                    </summary>
                    <div style="margin: 18px 0 10px 0;">
                        <ul style="margin-bottom: 16px; line-height: 1.7;">
                            <li>
                                <b style="color:#3a3a3a; font-style:italic; letter-spacing:0.5px; text-decoration:underline dotted #b39ddb;">Referrer</b>
                                <span style="color:#888; font-variant:small-caps; font-style:oblique;">(for browser apps)</span>
                                <br>
                                <span style="margin-left:1.2em; display:inline-block; font-style:oblique;">
                                    When your <b style="text-decoration:underline wavy #7a3cff;">front-end</b> (browser) calls the API directly.<br>
                                    <span style="color:#666; font-style:italic;">
                                        <i>
                                            <span style="font-variant:small-caps; font-weight:bold; font-style:normal; color:rgb(255,179,0)">🕵️‍♂️ To find your referrer:</span> <span style="font-style:normal;"></span><br>
                                            1. Open your browser's developer tools (usually F12 or right-click → Inspect).<br>
                                            2. Go to the <b style="text-decoration:underline dashed #ffb300;">Network</b> tab.<br>
                                            3. Make an API request from your app.<br>
                                            4. Click the request and look for the <b style="font-style:italic; text-decoration:underline dotted #ff61d8;">Referrer</b> header—this is your referrer URL.
                                        </i>
                                    </span>
                                </span>
                            </li>
                            <li style="margin-top:12px;">
                                <b style="color:#3a3a3a; font-style:italic; letter-spacing:0.5px; text-decoration:underline dotted #b39ddb;">Domain</b>
                                <span style="color:#888; font-variant:small-caps; font-style:oblique;">(for backend/server)</span>
                                <br>
                                <span style="margin-left:1.2em; display:inline-block; font-style:oblique;">
                                    When your <b style="text-decoration:underline wavy #7a3cff;">server</b> or <b style="text-decoration:underline wavy #7a3cff;">edge function</b> makes the call.<br>
                                    <span style="color:#666; font-style:italic;">We match the main site address to your tier. <span style="font-style:normal;">🔑</span></span>
                                </span>
                            </li>
                        </ul>
                    </div>
                </details>

                <div class="access-card">
                    <h2>🔑 API Token</h2>

                    <p class="section-info" style="font-style:italic; color:#2d3748;">
                        <b>Generate</b> a <span style="color:#00796b; font-style:italic;"><b>secure</b></span>, <span style="color:#6d28d9;"><b>private</b></span> token for your <span style="font-style:italic;">backend</span> or <span style="font-style:italic;">server-side</span> integrations.
                    </p>
                    <p>
                        <span style="font-weight:700; color:#d7263d; font-style:italic;">🔒 <u>Keep it secret</u>:</span>
                        <span style="color:#444; font-style:italic;"><b>Never</b> share your token <span style="color:#d7263d;">publicly</span>!</span>
                    </p>

                    <div id="token-info" class="status"><em>Loading token information...</em></div>
                    <button onclick="generateApiToken()">Generate New Token</button>
                                    
                </div>
                <details class="help-block">
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
