export const CSS = `
/* ===================================================================== */
/*                    POLLINATIONS.AI AUTH STYLES                       */
/* ===================================================================== */

/* FONTS */
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Pacifico&display=swap');

/* ===================================================================== */
/*                           DESIGN TOKENS                              */
/* ===================================================================== */

:root {
    --color-primary: #ff61d8;
    --color-secondary: #05ffa1;
    --color-accent:rgb(255, 200, 0);

    --color-text: #000000;
    --color-bg: #f0f0f0;
    --color-gray-light: #888;
    --color-gray-dark: #333;

    --color-purple: #7a3cff;

    --color-error: #ff3b5c;
    --color-success: #00796b;

    --color-dark-bg: #1a1a1a;
    --color-dark-bg-light: #2d2d2d;

    --color-white: var(--color-bg);
    --color-black: var(--color-text);

    --alpha-05: 0.05;
    --alpha-08: 0.08;
    --alpha-10: 0.1;
    --alpha-20: 0.2;
    --alpha-30: 0.3;
    --alpha-50: 0.5;
    --alpha-60: 0.6;
    --alpha-80: 0.8;
    --alpha-90: 0.9;

    --gradient-primary-secondary: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
    --gradient-brand-cycle: linear-gradient(45deg, var(--color-primary), var(--color-secondary), var(--color-accent), var(--color-primary));
    --gradient-psychedelic-bg: linear-gradient(135deg, rgba(255, 97, 216, var(--alpha-08)) 0%, rgba(5, 255, 161, var(--alpha-08)) 100%);
    --gradient-psychedelic-bg-1: linear-gradient(45deg, rgba(255, 97, 216, var(--alpha-08)) 0%, rgba(5, 255, 161, var(--alpha-08)) 70%, rgba(255, 200, 0, var(--alpha-08)) 100%);
    --gradient-psychedelic-bg-2: linear-gradient(225deg, rgba(5, 255, 161, var(--alpha-08)) 0%, rgba(255, 200, 0, var(--alpha-08)) 60%, rgba(255, 97, 216, var(--alpha-08)) 100%);
    --gradient-psychedelic-bg-3: linear-gradient(315deg, rgba(255, 200, 0, var(--alpha-08)) 0%, rgba(255, 97, 216, var(--alpha-08)) 40%, rgba(5, 255, 161, var(--alpha-08)) 100%);
    --gradient-psychedelic-bg-4: linear-gradient(180deg, rgba(255, 97, 216, var(--alpha-08)) 20%, rgba(5, 255, 161, var(--alpha-08)) 80%);
    --gradient-psychedelic-bg-5: linear-gradient(90deg, rgba(5, 255, 161, var(--alpha-08)) 0%, rgba(255, 97, 216, var(--alpha-08)) 50%, rgba(255, 200, 0, var(--alpha-08)) 100%);
    --gradient-neutral-gray: linear-gradient(135deg, var(--color-gray-light) 0%, var(--color-gray-medium) 100%);
    --gradient-accent-primary: linear-gradient(135deg, var(--color-accent) 0%, var(--color-primary) 100%);

    --gradient-container-light: linear-gradient(135deg, var(--color-bg) 0%, #fafafa 100%);
    --gradient-container-subtle: linear-gradient(135deg, #f8f8f8 0%, #f0f0f0 100%);

    --gradient-loading-overlay: linear-gradient(180deg, rgba(255, 255, 255, var(--alpha-80)) 0%, rgba(248, 248, 248, var(--alpha-90)) 100%);
    --gradient-loading-sweep: linear-gradient(90deg, transparent, rgba(255, 204, 0, var(--alpha-30)), transparent);
    --gradient-loading-gray: linear-gradient(180deg, rgba(200, 200, 200, var(--alpha-30)) 0%, rgba(150, 150, 150, var(--alpha-20)) 100%);

    --gradient-gray-light: linear-gradient(135deg, var(--color-gray-medium) 0%, #eaeaea 100%);
}

/* ===================================================================== */
/*                          GLOBAL STYLES                              */
/* ===================================================================== */

* {
    box-sizing: border-box;
    transition: all 0.2s;
}

body {
    font-family: 'Space Grotesk', sans-serif;
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
    background-color: white;
    color: var(--color-text);
    overflow-x: hidden;
}

.container {
    background: white;
    padding: 30px;
    border-radius: 16px;
    position: relative;
    border: 3px solid var(--color-primary);
    animation: smooth-border-cycle 10s infinite linear;
}

/* ===================================================================== */
/*                           ANIMATIONS                                 */
/* ===================================================================== */

@keyframes color-cycle {
    0% {
        --cycle-primary: var(--color-primary);
        --cycle-secondary: var(--color-secondary);
        --cycle-accent: var(--color-accent);
    }
    33% {
        --cycle-primary: var(--color-secondary);
        --cycle-secondary: var(--color-accent);
        --cycle-accent: var(--color-primary);
    }
    66% {
        --cycle-primary: var(--color-accent);
        --cycle-secondary: var(--color-primary);
        --cycle-accent: var(--color-secondary);
    }
    100% {
        --cycle-primary: var(--color-primary);
        --cycle-secondary: var(--color-secondary);
        --cycle-accent: var(--color-accent);
    }
}

@keyframes smooth-border-cycle {
    0% {
        border-color: var(--color-primary);
    }
    33% {
        border-color: var(--color-secondary);
    }
    66% {
        border-color: var(--color-accent);
    }
    100% {
        border-color: var(--color-primary);
    }
}

@keyframes flow {
    0%, 100% { background-position: 0% 50%; }
    25% { background-position: 100% 50%; }
    50% { background-position: 100% 100%; }
    75% { background-position: 0% 100%; }
}

@keyframes pulse {
    0%, 100% { opacity: 0.8; transform: translateX(-100%); }
    50% { opacity: 1; transform: translateX(100%); }
}

@keyframes tier-bg-shift {
    0% { background-position: 0% 50%; }
    25% { background-position: 100% 50%; }
    50% { background-position: 100% 100%; }
    75% { background-position: 0% 100%; }
    100% { background-position: 0% 50%; }
}

@keyframes tier-shine {
    0% { left: -100%; }
    50% { left: 100%; }
    100% { left: 100%; }
}

@keyframes ad-bg-pulse {
    0% { background-position: 0% 0%; }
    25% { background-position: 100% 0%; }
    50% { background-position: 100% 100%; }
    75% { background-position: 0% 100%; }
    100% { background-position: 0% 0%; }
}

@keyframes ad-glow-rotate {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

@keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-5px); }
}

h1, h2, h3 {
    position: relative;
    z-index: 1;
}

h1 {
    font-size: clamp(1.8rem, 6vw, 2.5rem);
    margin-bottom: 1.5rem;
    font-weight: 700;
    word-break: break-word;
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
    animation: smooth-border-cycle 8s infinite linear;
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
    background-color: var(--cycle-accent, var(--color-accent));
    animation: color-cycle 7s infinite linear;
}

#auth-button {
    font-size: 1.1rem;
    padding: 14px 32px;
    background: var(--gradient-brand-cycle);
    background-size: 300% 300%;
    animation: flow 6s ease infinite;
    border-radius: 40px;
}

#logout-button {
    padding: 14px 24px;
    width: auto;
    min-width: fit-content;
    white-space: nowrap;
    display: inline-block;
    font-size: 1rem;
    font-weight: 600;
}

.profile-badge {
    padding: 12px 24px;
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
    margin-right: 0px;
    margin-bottom: 0px;
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
    background: var(--color-gray-medium);
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
.error::before { background-color: var(--color-error); }

.info { background: white; }
.info::before { background-color: var(--color-accent); }

/* ===================================================================== */
/*                         FORM ELEMENTS                               */
/* ===================================================================== */

input {
    padding: 12px 16px;
    font-size: 1rem;
    border: 2px solid var(--color-gray-light);
    border-radius: 30px;
    margin-right: 10px;
    width: 200px;
    font-family: 'Space Grotesk', sans-serif;
}

input:focus {
    outline: none;
    border-color: var(--cycle-primary, var(--color-primary));
    animation: color-cycle 2s infinite alternate;
}

.hidden { display: none !important; }

#logout-button.hidden {
    display: none !important;
}

.input-group {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    margin-top: 10px;
}

.input-group button {
    margin-right: 0;
}

.domain-item {
    display: inline-block;
    padding: 6px 12px;
    margin: 5px 5px 5px 0;
    font-weight: 600;
    position: relative;
    overflow: hidden;
    border-radius: 20px;
    background: white;
    border: 2px solid var(--color-accent);
    border-color: var(--cycle-accent, var(--color-accent));
    animation: color-cycle 8s infinite alternate;
}

.domain-item .remove-domain {
    margin-left: 8px;
    cursor: pointer;
    font-weight: bold;
    color: var(--color-error);
    opacity: 0.7;
    transition: opacity 0.2s;
}

.domain-item .remove-domain:hover {
    opacity: 1;
}

code {
    background: var(--color-gray-light);
    padding: 8px 12px;
    border-radius: 8px;
    font-family: monospace;
    display: inline-block;
    border: 1px solid var(--color-gray-light);
    color: var(--color-primary);
    margin: 5px 0;
    position: relative;
    overflow: hidden;
    overflow-wrap: anywhere;
    word-break: break-word;
}

code::after {
    content: "";
    position: absolute;
    top: 0;
    left: -100%;
    width: 50%;
    height: 100%;
    background: rgba(255, 255, 255, var(--alpha-50));
    transform: skewX(-25deg);
    animation: pulse 3s infinite;
}

/* ===================================================================== */
/*                    AUTHENTICATION & PROFILE                         */
/* ===================================================================== */

.emoji-title {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}

.emoji-title span {
    font-size: 24px;
    display: inline-block;
    animation: bounce 2s infinite alternate;
}

.emoji-title .brand {
    display: inline-flex;
    align-items: center;
    font-size: clamp(1.4rem, 5vw, 2.2rem);
}

.emoji-title .auth-title {
    width: 100%;
    font-family: 'Pacifico', cursive;
    font-size: clamp(1.6rem, 5vw, 2.4rem);
    display: inline-block;
}

.title-logo {
    height: 1.4em;
    width: auto;
    margin-right: 6px;
}

/* ===================================================================== */
/*                        UTILITY CLASSES                              */
/* ===================================================================== */

.card-base {
    margin-top: 15px;
    border-radius: 18px;
    transition: all 0.3s ease;
}

.card-hover:hover {
    transform: translateY(-3px);
}

.card-padding-compact {
    padding: 15px 20px;
}

.card-padding-comfortable {
    padding: 20px 24px;
}

.hover-lift:hover {
    transform: translateY(-2px);
}

.hover-lift-psychedelic:hover {
    transform: translateY(-2px);
}

/* ===================================================================== */
/*                      INLINE STYLE REPLACEMENTS                      */
/* ===================================================================== */

.hero-subtitle {
    font-size: 1.25em;
    color: var(--color-gray-dark);
    margin-top: 8px;
}

.hero-highlight {
    background: var(--color-bg);
    border-radius: 6px;
    padding: 2px 8px;
}

.hero-features {
    color: var(--color-accent);
    font-weight: bold;
}

.hero-description {
    margin-top: 10px;
    font-size: 1.1em;
    color: var(--color-gray-light);
}

.hero-badge {
    display: inline-block;
    background: var(--color-bg);
    border-radius: 6px;
    padding: 2px 10px;
}

.hero-tagline {
    margin-top: 12px;
    margin-bottom: 12px;
    font-size: 1.05em;
    color: var(--color-purple);
}

.auth-section-flex {
    display: flex;
    align-items: center;
    gap: 1em;
    flex-wrap: wrap;
}

.tier-seed { color: var(--color-secondary); font-weight: bold; }
.tier-flower { color: var(--color-primary); font-weight: bold; }
.tier-nectar { color: var(--color-accent); font-weight: bold; }
.tier-beta { color: var(--color-purple); font-style: italic; }
.tier-automatic { font-style: italic; }
.tier-pilots { font-weight: bold; text-decoration: underline dotted var(--color-primary); }
.tier-higher { font-weight: bold; color: var(--color-accent); }
.tier-usage { font-style: italic; }
.tier-upgrade-text { color: var(--color-black); }

.domain-info {
    font-style: italic;
    font-weight: 500;
    color: var(--color-purple);
}

.domain-primary { font-weight: 700; color: var(--color-black); }
.domain-keyword { font-weight: 700; color: var(--color-primary); font-style: italic; }
.domain-or { color: var(--color-gray-light); }
.domain-referrer { font-weight: 700; color: var(--color-accent); }

.domain-examples {
    margin: 18px 0 10px 0;
}

.domain-examples-content {
    margin-bottom: 16px;
    line-height: 1.7;
}

.domain-simple-way {
    margin-bottom: 12px;
}

.domain-simple-label {
    color: var(--color-gray-dark);
    font-style: italic;
    letter-spacing: 0.5px;
}

.domain-simple-desc {
    color: var(--color-gray-light);
    font-style: italic;
}

.domain-example-list {
    margin-left: 1.2em;
    font-style: oblique;
    color: var(--color-gray-light);
}

.domain-code {
    background: var(--color-bg);
    padding: 2px 4px;
    border-radius: 3px;
}

.domain-finder {
    margin-top: 16px;
    padding: 12px;
    font-size: 1.2em;
}

.domain-finder-title {
    font-variant: small-caps;
    font-weight: bold;
    color: rgb(255,179,0);
}

.domain-finder-list {
    margin: 8px 0 0 16px;
    color: var(--color-gray-light);
}

.domain-network-tab {
    text-decoration: underline dashed var(--color-accent);
}

.domain-referrer-header {
    font-style: italic;
    text-decoration: underline dotted var(--color-primary);
}

.token-info {
    font-style: italic;
    color: var(--color-gray-dark);
}

.token-secure { color: var(--color-success); font-style: italic; }
.token-private { color: var(--color-purple); }
.token-backend { font-style: italic; }

.token-warning-title {
    display: inline-block;
    font-weight: 900;
    color: var(--color-error);
    font-style: italic;
    font-size: 1.18em;
    letter-spacing: 0.7px;
    text-shadow: 0 2px 10px var(--color-error)22;
    margin-bottom: 0.3em;
    border-bottom: 2px solid var(--color-error);
    padding-bottom: 2px;
}

.token-warning-list {
    margin: 14px 0 12px 0;
    padding-left: 1.4em;
    font-size: 1.09em;
    list-style: none;
}

.token-warning-item {
    margin-bottom: 10px;
    display: flex;
    align-items: center;
}

.token-warning-emoji {
    font-size: 1.1em;
    margin-right: 0.6em;
    color: var(--color-accent);
}

.token-warning-text {
    font-style: italic;
    font-weight: bold;
    color: var(--color-accent);
    background: var(--color-black);
    padding: 2px 6px;
    border-radius: 4px;
}

.token-error {
    color: var(--color-error);
    font-size: 0.98em;
    font-style: italic;
    margin-left: 2.2em;
    margin-top: -4px;
}

.usage-gray { color: var(--color-gray-light); }
.usage-beta {
    color: var(--color-purple);
    font-weight: bold;
    font-style: italic;
}
.usage-levelup { color: var(--color-primary); }
.usage-ads { color: var(--color-gray-light); }
.usage-tier { color: var(--color-accent); }

.emoji-large { font-size: 1.2em; }
.emoji-medium { font-size: 1.1em; }

/* ===================================================================== */
/*                        TOKEN DISPLAY                                */
/* ===================================================================== */

.tier-container {
    background: var(--gradient-psychedelic-bg-1);
    border: 2px solid var(--color-secondary);
    position: relative;
}

.ad-section {
    background: var(--gradient-psychedelic-bg-2);
    border: 2px solid var(--color-primary);
    border-radius: 16px;
    padding: 20px;
    position: relative;
}

.preferences-container {
    background: var(--gradient-container-subtle);
    border: 2px solid #e9c6ff;
}

.preferences-header h3 {
    margin: 5px 0 15px 0;
    color: var(--color-purple);
    font-weight: 800;
    letter-spacing: 0.5px;
    text-align: left;
    font-size: 1.3rem;
}

.preference-item {
    display: flex;
    align-items: center;
    padding: 12px 0;
    margin-bottom: 8px;
    border-radius: 12px;
    transition: all 0.2s ease;
}

.toggle-label {

    flex: 0 0 auto;
    margin-right: 10px;
    font-weight: 600;
    font-size: 1.05rem;
    color: var(--color-gray-dark);
}

.preference-status {
    margin-left: 10px;
    font-size: 0.9rem;
    color: var(--color-purple);
    font-weight: 600;
}

.preference-info {
    margin-top: 15px;
    padding: 10px;
    background: rgba(255, 255, 255, var(--alpha-60));
    border-radius: 12px;
    border-left: 4px solid var(--color-purple);
}

.preference-info p {
    margin: 6px 0;
    font-size: 0.95rem;
    color: var(--color-gray-dark);
}

.preference-info a {
    color: var(--color-purple);
    font-weight: bold;
    text-decoration: none;
    transition: all 0.2s;
    border-bottom: 1px dotted;
    padding-bottom: 1px;
}

.preference-info a:hover {
    color: var(--color-purple-dark);
    border-bottom: 1px solid;
}

/* ===================================================================== */
/*                      TIER & SUBSCRIPTION                            */
/* ===================================================================== */


.toggle-switch {
    position: relative;
    display: inline-block;
    width: 64px;
    height: 34px;
}

.toggle-switch input {

    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    cursor: pointer;
    opacity: 0;
    z-index: 2;
}

.toggle-slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--gradient-gray-light);
    border: 2px solid var(--color-primary);
    transition: all .4s ease;
    border-radius: 34px;
}

.toggle-slider:before {
    position: absolute;
    content: "";
    height: 24px;
    width: 24px;
    left: 4px;
    bottom: 3px;
    background: white;

    transition: all .4s ease;
    border-radius: 50%;
}

input:checked + .toggle-slider {
    background: var(--gradient-primary-secondary);
}

input:checked + .toggle-slider:before {
    transform: translateX(32px);
}

.tier-description {
    margin-top: 15px;
    line-height: 1.6;
}

.tier-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
}

.tier-header h3 {
    margin: 0;
}

.tier-pills {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
}

.tier-pill {
    padding: 6px 15px;
    border-radius: 20px;
    font-size: 1.3rem;
    font-weight: 600;
    transition: all 0.2s;
    border: 2px solid transparent;
    background-color: transparent;
    color: var(--color-gray-medium);
    cursor: default;
}

.tier-pill.active {
    color: white;
    transform: translateY(-1px);

}

.tier-pill.seed.active {
    background: var(--color-secondary);
}

.tier-pill.flower.active {
    background: var(--color-primary);
}

.tier-pill.nectar.active {
    background: var(--color-accent);
}

.help-block {
    background: var(--gradient-psychedelic-bg);
    border: 2px dashed var(--color-primary);
    border-radius: 14px;
    margin: 15px 0;
    transition: all 0.3s ease;
}

.help-block[open] {
    transform: translateY(-2px);
}

.help-block summary {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 18px;
    cursor: pointer;
    user-select: none;
    list-style: none;
    font-weight: 700;
    background: var(--gradient-primary-secondary);
    color: var(--color-white);
    border-radius: 12px;
    position: relative;
}

.help-block summary::-webkit-details-marker { display: none; }
.help-block summary::marker { content: ""; }

.help-block summary::after {
    content: '＋';
    font-size: 20px;
    margin-left: auto;
    transition: transform 0.25s ease, content 0.25s ease;
}
.help-block[open] summary::after {
    content: '−';
}

.help-block p,
.help-block ul,
.help-block code {
    margin-left: 20px;
}

.help-block ul {
    padding-left: 0;
    list-style: none;
}

.help-block li {
    position: relative;
    padding-left: 20px;
    margin: 6px 0;
}

.help-block li::before {
    content: '→';
    position: absolute;
    left: 0;
    color: var(--color-secondary);
    font-weight: bold;
}

.access-card {
    background: var(--gradient-psychedelic-bg);
    border: 2px solid var(--color-accent);
}

.access-card .section-info {
    margin-top: 0;
}

.access-card button {
    margin-top: 10px;
}

.profile-badge {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 12px 24px;
    border: 2px solid var(--color-secondary);
    border-radius: 40px;
    background: white;
    font-weight: 600;
    font-size: 1rem;
}

.profile-badge .gh-icon {
    font-size: 1.2rem;
}

.profile-badge .username {
    color: var(--color-primary);
}

.profile-badge .user-id {
    font-size: 0.85rem;
    color: var(--color-gray-dark);
}

.auth-section button + #badge-container {
    margin-left: 10px;
}

.cost-chart-container {
    margin-top: 15px;
    margin-bottom: 20px;
    background: var(--gradient-container-light);
    border-radius: 18px;
    padding: 20px;
    border: 2px solid transparent;
    background-clip: padding-box;
    position: relative;
    overflow: visible;
}

.cost-chart-container::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 18px;
    padding: 2px;
    background: var(--gradient-brand-cycle);
    background-size: 300% 300%;
    animation: flow 8s linear infinite;
    mask: linear-gradient(var(--color-white) 0 0) content-box, linear-gradient(var(--color-white) 0 0);
    mask-composite: exclude;
    -webkit-mask: linear-gradient(var(--color-white) 0 0) content-box, linear-gradient(var(--color-white) 0 0);
    -webkit-mask-composite: xor;
    z-index: -1;
}

.cost-chart-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
    flex-wrap: wrap;
    gap: 20px;
}

.cost-chart-narrative {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: nowrap;
}

.cost-chart-controls {
    display: flex;
    align-items: center;
    gap: 12px;
}

.cost-chart-toggle {
    display: flex;
    gap: 2px;
    background: var(--gradient-psychedelic-bg);
    border-radius: 30px;
    padding: 3px;
    border: 2px solid var(--color-primary);
    background-clip: padding-box;

}

.chart-toggle-btn {
    padding: 6px 14px;
    border: none;
    border-radius: 25px;
    font-size: 0.85rem;
    font-weight: 700;
    font-family: 'Space Grotesk', sans-serif;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    background: transparent;
    color: var(--color-text);
    opacity: 0.6;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.chart-toggle-btn:hover {
    opacity: 1;
    transform: translateY(-1px);
}

.chart-toggle-btn.active {
    background: var(--gradient-primary-secondary);
    color: white;
    opacity: 1;

    transform: translateY(-1px);
    text-shadow: 0 1px 2px rgba(0, 0, 0, var(--alpha-20));
}

.chart-nav-btn {
    padding: 8px 12px;
    border: none;
    border-radius: 20px;
    font-size: 1rem;
    font-weight: 600;
    font-family: 'Space Grotesk', sans-serif;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    background: var(--color-primary);
    color: white;
    border: none;
}

.chart-nav-btn:hover {
    background: var(--color-secondary);
    transform: translateY(-1px);
}

.chart-nav-btn:active {
    transform: translateY(0);

}

.chart-nav-btn.inactive {
    opacity: 0.3;
    cursor: not-allowed;
    background: var(--gradient-neutral-gray);
    color: var(--color-gray-muted);
}

.chart-nav-btn.inactive:hover {
    opacity: 0.3;
    transform: none;
    background: var(--gradient-neutral-gray);
    color: var(--color-gray-muted);

}

.cost-chart-header h2 {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 700;
    background: var(--gradient-primary-secondary);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    width: auto;
    text-align: left;
}

.cost-chart-total {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: var(--gradient-container-light);
    border-radius: 20px;
    border: 2px solid var(--color-accent);

}

.chart-total-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-text);
    opacity: 0.8;
}

.chart-total-value {
    font-size: 1.1rem;
    font-weight: 800;
    background: var(--gradient-accent-primary);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    font-family: 'Space Grotesk', monospace;
}

.chart-total-unit {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-text);
    opacity: 0.7;
}

.copy-chart-btn {
    background: none;
    border: none;
    padding: 4px;
    margin-left: 4px;
    border-radius: 4px;
    cursor: pointer;
    color: var(--color-text);
    opacity: 0.6;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
}

.copy-chart-btn:hover {
    opacity: 1;
    background: rgba(255, 204, 0, var(--alpha-10));
    transform: scale(1.1);
}

.copy-chart-btn:active {
    transform: scale(0.95);
}

.copy-chart-btn.copied {
    background: var(--color-primary) !important;
    color: white !important;
    opacity: 1 !important;
}

.copy-chart-btn svg {
    width: 14px;
    height: 14px;
}

.cost-chart-wrapper {
    position: relative;
    overflow: visible;
    padding: 30px 20px 10px 20px;
    margin: -20px -10px 0 -10px;
}

.cost-chart {
    display: flex;
    align-items: end;
    justify-content: space-between;
    height: 120px;
    padding: 10px 0;
    gap: 2px;
    background: var(--gradient-loading-overlay);
    border-radius: 12px;
    border: 1px solid rgba(255, 204, 0, var(--alpha-20));
    position: relative;
    overflow: visible;
}

.cost-chart.loading {

    overflow: hidden;
    animation: chart-loading-pulse 2s ease-in-out infinite;
}

.cost-chart.loading::after {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: var(--gradient-loading-sweep);
    animation: loading-sweep 2s ease-in-out infinite;
}

.cost-bar {
    flex: 1;
    background: linear-gradient(180deg, var(--color-primary) 0%, var(--color-secondary) 50%, var(--color-accent) 100%);
    border-radius: 3px 3px 0 0;
    min-height: 2px;
    position: relative;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: pointer;
    transform-origin: bottom;
}

.cost-bar:hover {
    transform: scaleY(1.1) scaleX(1.2);
    z-index: 10;

}

.cost-bar.zero {
    background: var(--gradient-loading-gray);
    min-height: 1px;
}

.cost-bar-tooltip {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, var(--alpha-90));
    color: white;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s;
    z-index: 9999;
    margin-bottom: 5px;

}

.cost-bar:hover .cost-bar-tooltip {
    opacity: 1;
}

.cost-chart-labels {
    display: flex;
    justify-content: space-between;
    margin-top: 8px;
    font-size: 0.75rem;
    color: var(--color-text);
    opacity: 0.6;
    font-weight: 500;
}

/* ===================================================================== */
/*                           TYPOGRAPHY                                 */
/* ===================================================================== */

h1, h2, h3 {
    font-family: 'Space Grotesk', monospace;
}

.cost-display {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    border: 3px solid transparent;
    border-radius: 25px;
    background: linear-gradient(135deg, var(--color-dark-bg) 0%, var(--color-dark-bg-light) 100%) padding-box,
                var(--gradient-brand-cycle) border-box;
    font-weight: 600;
    font-size: 0.95rem;
    animation: flow 8s linear infinite;
    cursor: default;
    user-select: none;
    position: relative;
    overflow: hidden;
    transform: translateZ(0);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.cost-display:hover {
    transform: translateY(-2px) scale(1.02);
}

.cost-display .cost-label,
.cost-display .cost-value {
    background: var(--gradient-brand-cycle);
    background-size: 300% 300%;
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}

.cost-display .cost-label {
    font-weight: 700;
    font-size: 0.85rem;
    letter-spacing: 0.5px;
    text-transform: uppercase;
}

.cost-display .cost-value {
    font-weight: 800;
    font-size: 1.15rem;
    font-family: 'Space Grotesk', monospace;
    letter-spacing: -0.5px;
}

.cost-display.loading {
    animation: flow 2s linear infinite;
}

.cost-display.loading .cost-value {
    animation: flow 1.5s ease-in-out infinite;
}

.token-wrapper {
display: flex;
align-items: center;
justify-content: space-between;
gap: 10px;
flex-wrap: wrap;
margin-top: 6px;
}

.token-wrapper .token-value {
flex: 1 1 auto;
}

.token-value.copyable {
    cursor: pointer;
    position: relative;
}

.token-value.copyable:hover {
}

.token-value.copied::after {
    content: '✅';
    position: absolute;
    right: -1.6em;
    top: 50%;
    transform: translateY(-50%);
}

.copy-token-btn {
    padding: 8px 14px;
    font-size: 1.2rem;
    background: var(--color-secondary);
    color: var(--color-black);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
}

.copy-token-btn:hover {
    background: var(--color-accent);

}

.copy-icon {
    pointer-events: none;
}

#auth-section {
    display: flex;
    align-items: center;
    gap: 1em;
    flex-wrap: wrap;
    margin-bottom: 1em;
}

#auth-section #badge-container {
    margin-top: 0;
}

@media (max-width: 600px) {
    #auth-section {
        gap: 0.5em;
    }

    .cost-display,
    button {
        font-size: 0.9rem;
        padding: 10px 20px;
    }
}

@media (max-width: 600px) {

    .cost-chart-controls {
        flex-wrap: wrap;
        justify-content: space-between;
        width: 100%;
        gap: 8px;
    }

    .cost-chart-controls > * {
        flex: 1 1 100%;
    }

    .chart-nav-btn {
        flex: 0 0 15%;
        padding: 6px 8px;
        font-size: 0.8rem;
    }

    .cost-chart-toggle {
        flex: 1 1 60%;
        display: flex;
        justify-content: center;
    }

    .chart-toggle-btn {
        flex: 1 1 33%;
        min-width: 0;
        text-align: center;
        padding: 4px 2px;
        font-size: 0.75rem;
    }
}

a.cta-hole {
    display: inline-block;
    background: var(--color-bg);
    color: var(--color-primary);
    padding: 8px 22px;
    font-size: 0.95rem;
    font-weight: 700;
    border-radius: 999px;
    border: 2px dashed var(--color-primary);
    text-decoration: none;
    position: relative;
    transition: transform 0.2s;
}

a.cta-hole:focus {
    outline: none;
}

.intro-tagline {
    font-size: 1.15rem;
    margin: -10px 0 24px 0;
    text-align: left;
    color: var(--color-text-dark);
    line-height: 1.5;
}
`;