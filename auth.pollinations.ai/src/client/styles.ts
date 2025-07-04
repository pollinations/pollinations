// Psychedelic Gen-Z style CSS for Pollinations.AI Auth
export const CSS = `
/* Psychedelic Gen-Z style with minimal code */
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&display=swap');
/* Display font for the secondary line (Auth) */
@import url('https://fonts.googleapis.com/css2?family=Pacifico&display=swap');

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

/* Funky login button */
#auth-button {
    font-size: 1.1rem;
    padding: 14px 32px;
    background: linear-gradient(135deg, var(--color-primary), var(--color-secondary), var(--color-accent));
    background-size: 300% 300%;
    animation: login-gradient 6s ease infinite;
    border-radius: 40px;
}

@keyframes login-gradient {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
}

/* Ensure logout button height aligns with badge */
#logout-button {
    padding: 12px 24px; /* keep consistent */
}

/* Adjust badge padding to match button height */
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

/* Updated layout: stack input above button */
.input-group {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    margin-top: 10px;
}

.input-group button {
    margin-right: 0; /* remove inline gap now that layout is vertical */
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
    animation: domain-shift 8s infinite alternate;
}

.domain-item .remove-domain {
    margin-left: 8px;
    cursor: pointer;
    font-weight: bold;
    color: #ff3b5c;
    opacity: 0.7;
    transition: opacity 0.2s;
}

.domain-item .remove-domain:hover {
    opacity: 1;
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
    flex-wrap: wrap;
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

/* Brand (logo + text) styling with subtle animated gradient */
.emoji-title .brand {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 700;
    font-size: clamp(1.4rem, 5vw, 2.2rem); /* smaller than before */
    color: var(--color-text); /* solid black */
}

/* Secondary line (Auth) uses playful font */
.emoji-title .auth-title {
    width: 100%; /* force it on new line */
    font-family: 'Pacifico', cursive;
    font-size: clamp(1.6rem, 5vw, 2.4rem);
    display: inline-block;
    margin-top: 4px;
}

/* Title logo styling */
.title-logo {
    height: 1.4em; /* revert to smaller size */
    width: auto;
    margin-right: 6px;
}

/* Help Section Styles */
.help-section {
    background: linear-gradient(135deg, rgba(255, 97, 216, 0.1), rgba(5, 255, 161, 0.1));
    border-radius: 16px;
    padding: 20px;
    margin-bottom: 30px;
    border: 2px dashed var(--color-primary);
}

.help-section summary {
    cursor: pointer;
    user-select: none;
    list-style: none;
}

.help-section summary::-webkit-details-marker {
    display: none;
}

.help-section summary h2 {
    margin: 0;
}

.help-section[open] summary {
    margin-bottom: 15px;
}

.help-section .help-content {
    display: grid;
    gap: 20px;
    margin-top: 15px;
}

.help-item {
    background: white;
    padding: 20px;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    transition: transform 0.2s, box-shadow 0.2s;
}

.help-item:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(255, 97, 216, 0.2);
}

.help-item h3 {
    margin-top: 0;
    margin-bottom: 10px;
    color: var(--color-primary);
}

.help-item p {
    margin: 10px 0;
    line-height: 1.6;
}

.help-details {
    margin-top: 15px;
    padding-left: 10px;
}

.help-details ul {
    list-style: none;
    padding-left: 0;
}

.help-details li {
    margin: 8px 0;
    padding-left: 20px;
    position: relative;
}

.help-details li::before {
    content: "→";
    position: absolute;
    left: 0;
    color: var(--color-secondary);
    font-weight: bold;
}

.pro-tips {
    list-style: none;
    padding: 0;
}

.pro-tips li {
    margin: 12px 0;
    display: flex;
    align-items: flex-start;
    gap: 10px;
}

.tip-emoji {
    font-size: 20px;
    flex-shrink: 0;
}

/* Enhanced code blocks for help section */
.help-item code {
    background: linear-gradient(90deg, #f8f9fa, #fff);
    font-size: 0.9rem;
}

/* Tier display styling */
.tier-container {
    margin-top: 15px;
    background: linear-gradient(135deg, #e8fff6 0%, #f0fff4 100%);
    border-radius: 18px;
    padding: 15px 20px;
    border: 2px solid var(--color-secondary);
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
    transition: all 0.3s ease;
    position: relative;
}

.tier-container:hover {
    transform: translateY(-3px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
}

.tier-badge {
    display: inline-block;
    padding: 8px 20px;
    border-radius: 30px;
}

/* Preferences styling */
.preferences-container {
    margin-top: 15px;
    background: linear-gradient(135deg, #fdf0ff 0%, #f0f7ff 100%);
    border-radius: 18px;
    padding: 15px 20px;
    border: 2px solid #e9c6ff;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
    transition: all 0.3s ease;
}

.preferences-container:hover {
    transform: translateY(-3px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
}

.preferences-header h3 {
    margin: 5px 0 15px 0;
    color: #7e57c2;
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
    /* Allow the label to take only the width it needs so the switch appears right next to it */
    flex: 0 0 auto;
    margin-right: 10px;
    font-weight: 600;
    font-size: 1.05rem;
    color: #444;
}

.preference-status {
    margin-left: 10px;
    font-size: 0.9rem;
    color: #7e57c2;
    font-weight: 600;
}

.preference-info {
    margin-top: 15px;
    padding: 10px;
    background: rgba(255, 255, 255, 0.6);
    border-radius: 12px;
    border-left: 4px solid #7e57c2;
}

.preference-info p {
    margin: 6px 0;
    font-size: 0.95rem;
    color: #555;
}

.preference-info a {
    color: #7e57c2;
    font-weight: bold;
    text-decoration: none;
    transition: all 0.2s;
    border-bottom: 1px dotted;
    padding-bottom: 1px;
}

.preference-info a:hover {
    color: #5e35b1;
    border-bottom: 1px solid;
}

/* Toggle Switch */
.toggle-switch {
    position: relative;
    display: inline-block;
    width: 64px;
    height: 34px; /* Bigger pill for better tap targets */
}

.toggle-switch input {
    /* Visually hidden but still clickable over the switch area */
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    cursor: pointer;
    opacity: 0;
    z-index: 2; /* place above slider so clicks reach the checkbox */
}

.toggle-slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, #f3f3f3 0%, #eaeaea 100%);
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
    box-shadow: 0 2px 6px rgba(0,0,0,0.1);
    transition: all .4s ease;
    border-radius: 50%;
}

input:checked + .toggle-slider {
    background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
}

input:checked + .toggle-slider:before {
    transform: translateX(32px);
}

.tier-badge::after {
    content: "";
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: rgba(255, 255, 255, 0.2);
    transform: skewX(-25deg);
    animation: tier-shine 3s infinite;
}

@keyframes tier-shine {
    0% { left: -100%; }
    20% { left: 200%; }
    100% { left: 200%; }
}

.tier-badge.seed {
    background: linear-gradient(135deg, #7ed56f, #28b485);
}

.tier-badge.flower {
    background: linear-gradient(135deg, #ff61d8, #ff3b5c);
}

.tier-badge.nectar {
    background: linear-gradient(135deg, #ffcc00, #ff9500);
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
    font-size: 0.9rem;
    font-weight: 600;
    transition: all 0.2s;
    border: 2px solid transparent;
    background-color: #f0f0f0;
    color: #888;
    cursor: default;
}

.tier-pill.active {
    color: white;
    transform: translateY(-1px);
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1);
}

.tier-pill.seed.active {
    background: linear-gradient(135deg, #7ed56f, #28b485);
}

.tier-pill.flower.active {
    background: linear-gradient(135deg, #ff61d8, #ff3b5c);
}

.tier-pill.nectar.active {
    background: linear-gradient(135deg, #ffcc00, #ff9500);
}

.tier-benefit-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 15px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    transition: transform 0.2s, box-shadow 0.2s;
}

.tier-benefit-item:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.tier-emoji {
    font-size: 20px;
    flex-shrink: 0;
}

/* 💬 Inline Help Blocks */
.help-block {
    background: linear-gradient(135deg, rgba(255, 97, 216, 0.05), rgba(5, 255, 161, 0.05));
    border: 2px dashed var(--color-primary);
    border-radius: 14px;
    margin: 15px 0;
    transition: all 0.3s ease;
}

.help-block[open] {
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.06);
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
    background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
    color: #fff;
    border-radius: 12px;
    position: relative;
}

/* Hide default disclosure arrow */
.help-block summary::-webkit-details-marker { display: none; }
.help-block summary::marker { content: ""; }

/* Custom + / - icon */
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

/* 🆕 Profile Card styling */
.profile-card {
    margin-top: 15px;
    background: linear-gradient(135deg, rgba(5, 255, 161, 0.1) 0%, rgba(255, 97, 216, 0.1) 100%);
    border-radius: 18px;
    padding: 20px 24px;
    border: 2px solid var(--color-secondary);
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
    transition: all 0.3s ease;
}

.profile-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
}

/* 💼 Access Card styling */
.access-card {
    margin-top: 15px;
    background: linear-gradient(135deg, rgba(5, 255, 161, 0.08) 0%, rgba(255, 97, 216, 0.08) 100%);
    border-radius: 18px;
    padding: 20px 24px;
    border: 2px solid var(--color-accent);
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
    transition: all 0.3s ease;
}

.access-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
}

.access-card .section-info {
    margin-top: 0;
}

.access-card button {
    margin-top: 10px;
}

/* Profile badge styling */
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
    color: #666;
}

.auth-section button + #badge-container {
    margin-left: auto;
}
.auth-section button + #usage-container
{
    margin-left: 20px;}
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
    box-shadow: 0 0 6px var(--color-accent);
}

/* Show a checkmark icon when copied */
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
    color: #000;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 6px var(--color-secondary);
}

.copy-token-btn:hover {
    background: var(--color-accent);
    box-shadow: 0 0 8px var(--color-accent);
}

.copy-icon {
    pointer-events: none;
}

/* Ensure user info appears on its own line below the logout button */
#auth-section {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}
    
#auth-section > * {
    margin-top: 0 !important; 
}

#badge-container,
#usage-container {
    flex: 0 0 auto;
    margin-top: 0;
}

#auth-section #badge-container,
#auth-section #usage-container {
    flex: 0 0 auto;
    margin-top: 8px; /* Small spacing from buttons */
}

/* CTA Hole Style – looks like a cut-out label inside cards */
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
    transition: transform 0.2s, box-shadow 0.2s;
}

a.cta-hole:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08);
}

a.cta-hole:focus {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-secondary);
}

/* Tagline under Auth heading */
.intro-tagline {
    font-size: 1.15rem;
    margin: -10px 0 24px 0;
    text-align: left;
    color: #3a3a3a;
    line-height: 1.5;
}
`;
