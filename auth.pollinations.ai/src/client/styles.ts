// Psychedelic Gen-Z style CSS for Pollinations.AI Auth
export const CSS = `
/* Psychedelic Gen-Z style with minimal code */
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&display=swap');

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
    font-size: 2.5rem;
    margin-bottom: 1.5rem;
    font-weight: 700;
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

.input-group { 
    display: flex;
    align-items: center;
    margin-top: 10px;
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

.section-info {
    color: #666;
    font-size: 0.95rem;
    margin: 10px 0;
    font-style: italic;
}

/* Enhanced code blocks for help section */
.help-item code {
    background: linear-gradient(90deg, #f8f9fa, #fff);
    font-size: 0.9rem;
}

/* Tier display styling */
.tier-container {
    margin-top: 15px;
    background: #f9f9f9;
    border-radius: 12px;
    padding: 10px 15px;
    border: 1px solid #eee;
    position: relative;
}

/* Removed rotating box background */

.tier-badge {
    display: inline-block;
    padding: 8px 20px;
    border-radius: 30px;
    font-weight: 700;
    font-size: 1.2rem;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin: 10px 0 20px 0;
    position: relative;
    overflow: hidden;
    color: white;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
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
`;
