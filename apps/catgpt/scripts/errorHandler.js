// Error Handling and Retry Logic

import { showNotification, getRandomItem } from './utilities.js';
import { startCatAnimation, stopCatAnimation } from './animations.js';
import { ERROR_MESSAGES } from './config.js';

export function handleImageError(errorType = 'general') {
    const randomMessage = getRandomItem(ERROR_MESSAGES);
    
    let specificMessage;
    if (errorType === 'timeout') {
        specificMessage = `⏰ This cat took too long to respond... probably distracted by a laser pointer! ${randomMessage}`;
    } else {
        specificMessage = randomMessage;
    }
    
    showNotification(specificMessage, 'error');
    stopCatAnimation();
    
    startRetryCountdown();
}

export function startRetryCountdown() {
    let countdown = 10;
    
    startCatAnimation('retry');
    
    const retryContainer = document.createElement('div');
    retryContainer.id = 'retryContainer';
    retryContainer.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #ff61d8, #05ffa1);
        color: white;
        padding: 2rem;
        border-radius: 20px;
        text-align: center;
        z-index: 1000;
        box-shadow: 0 20px 40px rgba(0,0,0,0.2);
        backdrop-filter: blur(10px);
        border: 2px solid rgba(255,255,255,0.2);
        font-family: 'Space Grotesk', sans-serif;
        min-width: 300px;
    `;
    
    const title = document.createElement('h3');
    title.style.cssText = `
        margin: 0 0 1rem 0;
        font-size: 1.5rem;
        text-shadow: 0 2px 4px rgba(0,0,0,0.3);
    `;
    title.innerHTML = '😸 CatGPT is blowing up rn...';
    
    const countdownDisplay = document.createElement('div');
    countdownDisplay.style.cssText = `
        font-size: 4rem;
        font-weight: 700;
        margin: 1rem 0;
        animation: pulse 1s infinite;
        text-shadow: 0 4px 8px rgba(0,0,0,0.3);
    `;
    
    const subtitle = document.createElement('p');
    subtitle.style.cssText = `
        margin: 1rem 0 0 0;
        opacity: 0.9;
        font-size: 1rem;
    `;
    subtitle.innerHTML = 'The whole internet wants cat wisdom! Auto-retry in... 🐾';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.innerHTML = 'Cancel ❌';
    cancelBtn.style.cssText = `
        background: rgba(255,255,255,0.2);
        border: 2px solid rgba(255,255,255,0.3);
        color: white;
        padding: 0.8rem 1.5rem;
        border-radius: 10px;
        cursor: pointer;
        font-weight: 600;
        margin-top: 1rem;
        transition: all 0.3s;
    `;
    
    retryContainer.appendChild(title);
    retryContainer.appendChild(countdownDisplay);
    retryContainer.appendChild(subtitle);
    retryContainer.appendChild(cancelBtn);
    document.body.appendChild(retryContainer);
    
    const countdownInterval = setInterval(() => {
        countdown--;
        countdownDisplay.textContent = countdown;
        
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            retryContainer.remove();
            stopCatAnimation();
            
            // Import and call generateMeme to retry
            import('./generator.js').then(({ generateMeme }) => {
                generateMeme();
            });
        }
    }, 1000);
    
    cancelBtn.addEventListener('click', () => {
        clearInterval(countdownInterval);
        retryContainer.remove();
        stopCatAnimation();
    });
    
    countdownDisplay.textContent = countdown;
}
