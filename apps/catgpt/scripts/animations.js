// Animation Functions

import { ANIMATION_CONFIG } from './config.js';
import { getRandomItem } from './utilities.js';

let catAnimationInterval;
let progressInterval;
let progressStep = 0;

export function startCatAnimation(mode = 'loading') {
    const catEmojis = mode === 'retry' ? ANIMATION_CONFIG.RETRY_CATS : ANIMATION_CONFIG.LOADING_CATS;
    const speed = mode === 'retry' ? 800 : 400;
    
    catAnimationInterval = setInterval(() => {
        const cat = document.createElement('div');
        const animationName = mode === 'retry' ? 'catSlowWalk' : 'catSlide';
        
        cat.style.cssText = `
            position: fixed;
            font-size: ${2 + Math.random() * 2}rem;
            z-index: 999;
            pointer-events: none;
            top: ${Math.random() * 100}vh;
            left: -100px;
            animation: ${animationName} ${3 + Math.random() * 2}s linear forwards;
        `;
        
        cat.textContent = getRandomItem(catEmojis);
        document.body.appendChild(cat);
        
        setTimeout(() => {
            if (cat.parentNode) {
                cat.remove();
            }
        }, 6000);
    }, speed);
}

export function stopCatAnimation() {
    if (catAnimationInterval) {
        clearInterval(catAnimationInterval);
        catAnimationInterval = null;
    }
    
    document.querySelectorAll('[style*="catSlide"]').forEach(cat => cat.remove());
}

export function startFakeProgress(progressMessages) {
    progressStep = 0;
    const progressText = document.createElement('div');
    progressText.id = 'progress-text';
    progressText.style.cssText = `
        text-align: center;
        font-size: 0.9rem;
        color: var(--color-primary);
        margin-top: 1rem;
        font-weight: 500;
        animation: pulse 2s infinite;
    `;
    
    const loadingIndicator = document.getElementById('loadingIndicator');
    loadingIndicator.appendChild(progressText);
    
    progressInterval = setInterval(() => {
        if (progressStep < progressMessages.length) {
            progressText.textContent = progressMessages[progressStep];
            progressStep++;
        } else {
            progressText.textContent = "🎨 Finalizing your masterpiece...";
        }
    }, 2500);
    
    progressText.textContent = progressMessages[0];
    progressStep = 1;
}

export function stopFakeProgress() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
    const progressText = document.getElementById('progress-text');
    if (progressText) {
        progressText.remove();
    }
}

export function celebrate() {
    for (let i = 0; i < 20; i++) {
        setTimeout(() => {
            const emoji = document.createElement('div');
            emoji.textContent = getRandomItem(ANIMATION_CONFIG.CELEBRATION_EMOJIS);
            emoji.style.cssText = `
                position: fixed;
                left: ${Math.random() * 100}%;
                top: -50px;
                font-size: ${20 + Math.random() * 20}px;
                color: ${getRandomItem(ANIMATION_CONFIG.CELEBRATION_COLORS)};
                animation: fall ${2 + Math.random() * 2}s ease-in forwards;
                z-index: 999;
                pointer-events: none;
            `;
            
            document.body.appendChild(emoji);
            
            setTimeout(() => {
                emoji.remove();
            }, 4000);
        }, i * 100);
    }
}

export function addFloatingEmojis() {
    const container = document.querySelector('.container');
    
    ANIMATION_CONFIG.FLOATING_EMOJIS.forEach((emoji, index) => {
        const floater = document.createElement('div');
        floater.textContent = emoji;
        floater.className = 'floating-emoji';
        floater.style.cssText = `
            position: absolute;
            font-size: 2rem;
            opacity: 0.1;
            animation: float ${10 + index * 2}s infinite ease-in-out;
            animation-delay: ${index * 2}s;
            pointer-events: none;
            z-index: -1;
        `;
        
        container.appendChild(floater);
    });
}

export function addAnimationStyles() {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        
        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
        
        @keyframes fall {
            to {
                transform: translateY(calc(100vh + 100px)) rotate(360deg);
                opacity: 0;
            }
        }
        
        @keyframes float {
            0%, 100% {
                transform: translate(0, 0) rotate(0deg);
            }
            25% {
                transform: translate(100px, -50px) rotate(90deg);
            }
            50% {
                transform: translate(-50px, -100px) rotate(180deg);
            }
            75% {
                transform: translate(-100px, -50px) rotate(270deg);
            }
        }
        
        @keyframes pulse {
            0%, 100% {
                transform: scale(1);
            }
            50% {
                transform: scale(1.05);
            }
        }
        
        @keyframes catSlide {
            0% {
                left: -100px;
                transform: rotate(0deg);
            }
            50% {
                transform: rotate(180deg);
            }
            100% {
                left: calc(100vw + 100px);
                transform: rotate(360deg);
            }
        }
        
        @keyframes catSlowWalk {
            0% {
                left: -100px;
                transform: rotate(0deg);
            }
            50% {
                transform: rotate(180deg);
            }
            100% {
                left: calc(100vw + 100px);
                transform: rotate(360deg);
            }
        }
        
        @keyframes rainbow {
            0% { filter: hue-rotate(0deg); }
            100% { filter: hue-rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
}
