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
                <img src="https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/master/assets/logo.svg" alt="pollinations.ai" class="title-logo" />
                Pollinations.AI
            </span>
            <span class="auth-title">🐝 Auth 🌸</span>
        </h1>
        
        <!-- Intro section (visible only when logged out) -->
        <div id="intro-text">
            <!-- Primary CTA: New API -->
            <div style="margin-top: 20px; padding: 28px; background: #f8f9fa; border-radius: 12px; text-align: center; border: 2px solid #e0e0e0;">
                <h2 style="margin: 0 0 12px 0; color: #333; font-size: 1.6em; font-weight: 600;">
                    🚀 Our New API is Here
                </h2>
                <p style="margin: 0 0 20px 0; color: #666; font-size: 1em; line-height: 1.5;">
                    Enter the beta now · All models & features · Free & Anonymous
                </p>
                <a href="https://enter.pollinations.ai" target="_blank" style="display: inline-block; padding: 12px 28px; background: #333; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 1em; transition: background 0.2s;" onmouseover="this.style.background='#555'" onmouseout="this.style.background='#333'">
                    Go to enter.pollinations.ai →
                </a>
            </div>

            <!-- Divider -->
            <div style="margin: 32px 0; text-align: center; color: #999; font-size: 0.9em;">
                <span style="background: white; padding: 0 12px; position: relative; z-index: 1;">or</span>
                <div style="position: relative; top: -12px; border-top: 1px solid #ddd; z-index: 0;"></div>
            </div>

            <!-- Secondary: Legacy API Access -->
            <div style="padding: 20px; background: white; border-radius: 8px; border: 1px solid #ddd;">
                <h3 style="margin: 0 0 10px 0; color: #555; font-size: 1.1em; font-weight: 500;">
                    Legacy API Access
                </h3>
                <p style="margin: 0 0 16px 0; color: #777; font-size: 0.95em; line-height: 1.5;">
                    Already using the legacy API? Login to manage your tokens and domains.
                </p>
                <button id="auth-button" onclick="startAuth()" style="padding: 10px 24px; font-size: 1em;">Login with GitHub</button>
            </div>

            <!-- Deprecation Notice -->
            <div style="margin-top: 24px; padding: 14px 16px; background: #fafafa; border-radius: 6px; border-left: 3px solid #999; font-size: 0.9em; color: #666; line-height: 1.6;">
                <p style="margin: 0;">
                    <span style="font-weight: 600; color: #555;">ℹ️ Notice:</span> 
                    The legacy API will be deprecated in the future. It is still fully operational and receiving support, but we encourage new projects to use <b>enter.pollinations.ai</b>.
                </p>
            </div>
        </div>

        <!-- 🔐 Authentication (logged in state) -->
        <div id="auth-section" style="margin-top: 40px; display:none;">
            <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
                <button id="logout-button" onclick="logout()" class="hidden">Logout</button>
                <div id="badge-container" class="hidden"></div>
            </div>
        </div>

        <!-- 👤 Account Section -->
        <div id="account-section">
            <div id="user-section" class="hidden">
                <!-- 🌟 Tier Section -->
                <div id="tier-section" class="tier-container hidden">
                    <div class="tier-header">
                        <h2>✨ Tier</h2>
                    </div>
                    
                    <!-- Deprecation message (shown when tier is legacy) -->
                    <div id="tier-deprecation-message" class="hidden" style="padding: 20px; background: linear-gradient(135deg, #fff9e6 0%, #ffe8f5 100%); border-radius: 12px; border: 2px solid #ffb300;">
                        <p style="margin: 0; font-size: 1.1em; color: #333; line-height: 1.6;">
                            <span style="font-size: 1.3em;">🌸</span> 
                            <span style="font-weight: bold; color: #7a3cff;">This tier system is closed for now.</span>
                            <br><br>
                            <span style="font-style: italic;">Subscribe to the beta of our new API</span>
                            <br>
                            <a href="https://enter.pollinations.ai" target="_blank" style="display: inline-block; margin-top: 12px; padding: 10px 20px; background: linear-gradient(135deg, #7a3cff 0%, #ff61d8 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; transition: transform 0.2s;">
                                <span style="font-size: 1.2em;">🚀</span> Visit enter.pollinations.ai
                            </a>
                        </p>
                    </div>
                    
                    <!-- Active tier display (hidden for legacy users) -->
                    <div id="tier-active-display">
                        <div class="tier-description">
                            <p>
                                <span style="color:#2ecc40; font-weight:bold;">Seed</span>, <span style="color:#ff61d8; font-weight:bold;">Flower</span>, and <span style="color:#ffb300; font-weight:bold;">Nectar</span> tiers were assigned during <span style="color:#7a3cff; font-style:italic;"><b>beta</b></span>.<br>
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
                                <br>
                                <div style="display: flex; flex-direction: column; gap: 15px; margin-top: 15px;">
                                    <div style="background: rgba(0,0,0,0.03); padding: 15px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.05);">
                                        <p style="margin: 0 0 8px 0; font-size: 0.95em; line-height: 1.5; color: #444;">
                                            <b>Auth is fully supported</b> but will be deprecated as <a href="https://enter.pollinations.ai" target="_blank" style="color:var(--color-primary); text-decoration:none; font-weight:bold;">Enter</a> takes over.
                                        </p>
                                        <p style="margin: 0; font-size: 0.95em; line-height: 1.5; color: #666; font-style: italic;">
                                            Tiers are frozen during the new <b>Enter</b> beta.
                                        </p>
                                    </div>
                                    
                                    <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 10px;">
                                        <a href="https://enter.pollinations.ai" target="_blank" style="text-decoration: none;">
                                            <button class="beta-button">Join New Beta Experience 🚀</button>
                                        </a>
                                        
                                        <div style="margin-top: 5px;">
                                            <span style="color:#666; font-size: 0.9em; display: block; margin-bottom: 5px;">
                                                Experiencing trouble with tier migration?
                                            </span>
                                            <a href="https://github.com/pollinations/pollinations/issues/new?title=Tier%20Migration%20Request&body=Please%20migrate%20my%20tier." target="_blank" style="text-decoration: none;">
                                                <button class="migration-button">Request Tier Migration</button>
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </p>
                        </div>
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
                                🚀 Beta (soon!): <span style="color:#ff61d8;">Level up faster</span> — <span style="color:#444;">More Ads</span> <span style="color:#ffb300;">= Higher Tier</span>
                            </span>
                    <p><b><i>Want credit card payments instead?</i></b> 💳 
                    <br>
                    <br>
                    <a href="https://github.com/pollinations/pollinations/issues/2202" target="_blank" class="cta-hole">Vote/discuss</a></p>
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
                        <span style="color:#444;"> your app calls from.</span>
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
                        <b>How to find your domain</b>
                        <span style="font-size:1.1em;"></span>
                    </summary>
                    <div style="margin: 18px 0 10px 0;">
                        <div style="margin-bottom: 16px; line-height: 1.7;">
                            <p style="margin-bottom: 12px;">
                                <b style="color:#3a3a3a; font-style:italic; letter-spacing:0.5px;">Simple way:</b>
                                <span style="color:#666; font-style:italic;">Just enter the domain (including subdomains) of your deployed site.</span>
                            </p>
                            
                            <p style="margin-left:1.2em; font-style:oblique; color:#888;">
                                Examples: <code style="background:#f0f0f0; padding:2px 4px; border-radius:3px;">myapp.com</code>, 
                                <code style="background:#f0f0f0; padding:2px 4px; border-radius:3px;">username.github.io</code>, 
                                <code style="background:#f0f0f0; padding:2px 4px; border-radius:3px;">myapp.vercel.app</code>
                            </p>
                            
                            <div style="margin-top: 16px; padding: 12px; font-size:1.2em;">
                                <span style="font-variant:small-caps; font-weight:bold; color:rgb(255,179,0)">🕵️‍♂️ Find your referrer:</span>
                                <ol style="margin: 8px 0 0 16px; color:#666;">
                                    <li>Open browser developer tools (F12 or right-click → Inspect)</li>
                                    <li>Go to the <b style="text-decoration:underline dashed #ffb300;">Network</b> tab</li>
                                    <li>Make an API request from your app</li>
                                    <li>Click the request and look for the <b style="font-style:italic; text-decoration:underline dotted #ff61d8;">Referrer</b> header</li>
                                </ol>
                            </div>
                        </div>
                    </div>
                </details>

                <div class="access-card">
                    <h2>🔑 API Token</h2>

                    <p class="section-info" style="font-style:italic; color:#2d3748;">
                        <b>Generate</b> a <span style="color:#00796b; font-style:italic;"><b>secure</b></span>, <span style="color:#6d28d9;"><b>private</b></span> token for your <span style="font-style:italic;">backend</span> or <span style="font-style:italic;">server-side</span> integrations.
                    </p>

                    <span style="display:inline-block; font-weight:900; color:#d7263d; font-style:italic; font-size:1.18em; letter-spacing:0.7px; text-shadow:0 2px 10px #d7263d22; margin-bottom:0.3em; border-bottom:2px solid #d7263d; padding-bottom:2px;">
                        🔒 Keep your token secure!
                    </span>
                    <ul style="margin: 14px 0 12px 0; padding-left: 1.4em; font-size:1.09em; list-style:none;">
                        <li style="margin-bottom:10px; display:flex; align-items:center;">
                            <span style="font-size:1.1em; margin-right:0.6em; color:#f9ca24;">⚠️</span>
                            <span style="font-style:italic; font-weight:bold; color:#f9ca24; background:black; padding:2px 6px; border-radius:4px;">
                                Never share your token publicly anywhere
                            </span>
                        </li>
                        <li style="display:flex; align-items:center; margin-bottom:0;">
                            <span style="font-size:1.1em; margin-right:0.6em; color:#f9ca24;">🚧</span>
                            <span style="color:#f9ca24; font-weight:bold; background:black; padding:2px 6px; border-radius:4px;">
                                Don't commit tokens to Git/GitHub repositories
                            </span>
                        </li>
                    </ul>
                    <div style="color:red; font-size:0.98em; font-style:italic; margin-left:2.2em; margin-top:-4px;">
                        <span style="font-size:1.1em; margin-right:0.4em">✨</span> Use <b>.env</b> files to store tokens safely
                    </div>

                    <div id="token-info" class="status"><em>Loading token information...</em></div>
                    <button onclick="generateApiToken()">(Re)generate Token</button>
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
