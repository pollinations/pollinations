// HTML template for Pollinations.AI Auth client
import { CSS } from "./styles";
import { JS } from "./scripts";

export const generateHTML = () => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Authentification</title>
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
                <img src="https://raw.githubusercontent.com/pollinations/pollinations/master/operations/assets/pollinations_ai_logo_text_black.png" alt="Pollinations Logo" class="title-logo" />
            </span>
            <span class="auth-title">🐝 Auth 🌸</span>
        </h1>
        
        <!-- Intro section with tagline (visible only when logged out) -->
        <div id="intro-text">
            <div class="hero-subtitle">
                <span class="hero-highlight">
                    <b>Sign in</b> to unlock <span class="hero-features">all models &amp; features</span>
                </span>
            </div>
            <div class="hero-description">
                <span class="hero-badge">
                    <b>Free</b> &nbsp;|&nbsp; <b>Anonymous</b> 
                </span>
            </div>
            <div class="hero-tagline">
                <i>Gen-AI API for everyone <span class="emoji-large">🌟</span></i>
            </div>
        </div>

        <div id="auth-section" class="auth-section-flex">
            <button id="auth-button" onclick="startAuth()">Login with GitHub</button>
            <button id="logout-button" onclick="logout()" class="hidden">Logout</button>
            <div id="badge-container" class="hidden"></div>
            <div id="cost-section" class="hidden">
                <div class="cost-display loading" id="cost-display">
                    <span id="cost-value" class="cost-value">•••</span>
                    <span class="cost-label">PLN</span>
                </div>
            </div>
        </div>



        <!-- 👤 Account Section -->
        <div id="account-section">
            <div id="user-section" class="hidden">
                <!-- 📊 Cost Bar Graph with Toggle -->
                <div id="cost-chart-section" class="cost-chart-container hidden">
                    <div class="cost-chart-header">
                        <div class="cost-chart-narrative">
                            <h2 id="chart-title">Today</h2>
                            <div class="cost-chart-total">
                                <span id="chart-total-value" class="chart-total-value">-•••</span>
                                <span class="chart-total-unit">PLN</span>
                                <button id="copy-chart-json" class="copy-chart-btn" onclick="copyChartJson()" title="Copy chart JSON data">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div class="cost-chart-controls">
                            <button id="nav-prev" class="chart-nav-btn" onclick="navigateChart(-1)">←</button>
                            <div class="cost-chart-toggle">
                                <button id="toggle-day" class="chart-toggle-btn active" onclick="switchChartView('day')">Day</button>
                                <button id="toggle-week" class="chart-toggle-btn" onclick="switchChartView('week')">Week</button>
                                <button id="toggle-month" class="chart-toggle-btn" onclick="switchChartView('month')">Month</button>
                            </div>
                            <button id="nav-next" class="chart-nav-btn" onclick="navigateChart(1)">→</button>
                        </div>
                    </div>
                    <div class="cost-chart-wrapper">
                        <div id="cost-chart" class="cost-chart loading">
                            <!-- 24 bars will be generated here -->
                        </div>
                        <div class="cost-chart-labels">
                            <span id="chart-label-start" class="chart-label-start">24h ago</span>
                            <span id="chart-label-end" class="chart-label-end">Now</span>
                        </div>
                    </div>
                </div>

                <!-- 🌟 Tier Section -->
                <div id="tier-section" class="tier-container card-base card-hover card-padding-compact hidden">
                    <div class="tier-header">
                        <h2>✨ Tier</h2>
                    </div>
                    <div class="tier-description">
                        <p>
                            <span class="tier-seed">Seed</span> tier is <span class="tier-automatic"><b>automatic</b></span> on first login.<br>
                            <span class="tier-flower">Flower</span> and <span class="tier-nectar">Nectar</span> are assigned in <span class="tier-pilots">limited pilots</span> while we're in <span class="tier-beta"><b>beta</b></span>.<br>
                            <span class="tier-higher">Higher tiers</span> = <span class="tier-usage">more Gen‑AI usage</span>!
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
                            <span class="emoji-large"></span>
                            <b><i>Want to <span class="tier-upgrade-text">upgrade</span> to <span class="tier-flower">Flower</span> or <span class="tier-nectar">Nectar</span> tier?</i></b>
                            <br>
                            <br>
                            <a href="https://github.com/pollinations/pollinations/issues/new?template=special-bee-request.yml" target="_blank" class="cta-hole hover-lift">Request access!</a>
                        </p>
                    </div>
                </div>

                <div id="preferences-section" class="ad-section card-base card-hover hidden">
                    <div class="preferences-header">
                        <h2>🪧 Ads</h2>
                    </div>
                        <div>
                            <span class="usage-gray">
                                    <span class="usage-gray">
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
                            <span class="usage-beta">
                                🚀 Beta (soon!): <span class="usage-levelup">Level up faster</span> — <span class="usage-ads">More Ads</span> <span class="usage-tier">= Higher Tier</span>
                            </span>
                    <p><b><i>Want credit card payments instead?</i></b> 💳 
                    <br>
                    <br>
                    <a href="https://github.com/pollinations/pollinations/issues/2202" target="_blank" class="cta-hole hover-lift">Vote/discuss</a></p>
                </div>
            </div>
        </div>

        <!-- 🔑 Allowed Section -->
        <div id="whitelist-section">
            <div id="domain-section" class="hidden">
                <div class="access-card card-base card-hover card-padding-comfortable">
                    <h2>🔑 Referrer / Domain</h2>
                    <p class="section-info domain-info">
                        <span class="domain-primary">Enter the primary </span>
                        <span class="domain-keyword">domain</span>
                        <span class="domain-or"> or </span>
                        <span class="domain-referrer">referrer</span>
                        <span class="domain-or"> your app calls from.</span>
                    </p>
                    <div class="input-group">
                        <input type="text" id="new-domain" placeholder="example.com">
                        <button onclick="addDomain()">Add</button>
                    </div>
                    <div id="domain-info" class="status"></div>
                </div>
                <details class="help-block">
                    <summary>
                        <span class="emoji-medium">🤔</span>
                        <b>How to find your domain</b>
                        <span class="emoji-medium"></span>
                    </summary>
                    <div class="domain-examples">
                        <div class="domain-examples-content">
                            <p class="domain-simple-way">
                                <b class="domain-simple-label">Simple way:</b>
                                <span class="domain-simple-desc">Just enter the domain (including subdomains) of your deployed site.</span>
                            </p>
                            
                            <p class="domain-example-list">
                                Examples: <code class="domain-code">myapp.com</code>, 
                                <code class="domain-code">username.github.io</code>, 
                                <code class="domain-code">myapp.vercel.app</code>
                            </p>
                            
                            <div class="domain-finder">
                                <span class="domain-finder-title">🕵️‍♂️ Find your referrer:</span>
                                <ol class="domain-finder-list">
                                    <li>Open browser developer tools (F12 or right-click → Inspect)</li>
                                    <li>Go to the <b class="domain-network-tab">Network</b> tab</li>
                                    <li>Make an API request from your app</li>
                                    <li>Click the request and look for the <b class="domain-referrer-header">Referrer</b> header</li>
                                </ol>
                            </div>
                        </div>
                    </div>
                </details>

                <div class="access-card card-base card-hover card-padding-comfortable">
                    <h2>🔑 API Token</h2>

                    <p class="section-info token-info">
                        <b>Generate</b> a <span class="token-secure"><b>secure</b></span>, <span class="token-private"><b>private</b></span> token for your <span class="token-backend">backend</span> or <span class="token-backend">server-side</span> integrations.
                    </p>

                    <span class="token-warning-title">
                        🔒 Keep your token secure!
                    </span>
                    <ul class="token-warning-list">
                        <li class="token-warning-item">
                            <span class="token-warning-emoji">⚠️</span>
                            <span class="token-warning-text">Never share your token publicly anywhere</span>
                        </li>
                        <li class="token-warning-item">
                            <span class="token-warning-emoji">🚧</span>
                            <span class="token-warning-text">Don't commit tokens to Git/GitHub repositories</span>
                        </li>
                    </ul>
                    <div class="token-error">
                        <span class="emoji-medium">✨</span> Use <b>.env</b> files to store tokens safely
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
