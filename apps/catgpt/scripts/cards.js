// Meme Card Creation

import { dom } from './ui.js';
import { showNotification } from './utilities.js';

export function createUserMemeCard(prompt, index, imageUrl) {
    if (!imageUrl) {
        console.warn(`User meme has no URL: "${prompt}"`);
        return null;
    }
    
    const card = document.createElement('div');
    card.className = 'example-card';
    card.style.animationDelay = `${index * 0.1}s`;
    card.style.border = '2px solid var(--color-accent)';
    card.style.boxShadow = '0 0 10px rgba(255, 105, 180, 0.3)';
    
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = prompt;
    img.loading = 'lazy';
    
    const badge = document.createElement('div');
    badge.textContent = '✨ Your Meme';
    badge.style.cssText = `
        background: var(--gradient-1);
        color: white;
        padding: 0.2rem 0.5rem;
        border-radius: 10px;
        font-size: 0.7rem;
        font-weight: bold;
        margin-bottom: 0.5rem;
        text-align: center;
    `;
    
    const promptText = document.createElement('p');
    promptText.textContent = `"${prompt}"`;
    promptText.style.fontStyle = 'italic';
    promptText.style.fontSize = '0.9rem';
    promptText.style.color = 'var(--color-primary)';
    promptText.style.textAlign = 'center';
    promptText.style.margin = '0.5rem 0';
    
    card.appendChild(badge);
    card.appendChild(img);
    card.appendChild(promptText);
    
    card.addEventListener('click', () => {
        dom.userInput.value = prompt;
        dom.userInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        dom.userInput.focus();
        
        dom.userInput.style.animation = 'pulse 0.5s';
        setTimeout(() => {
            dom.userInput.style.animation = '';
        }, 500);
        
        showNotification('Generating your meme! 🎨', 'info');
    });
    
    return card;
}

export function createExampleCard(prompt, index, examplesMap) {
    const imageUrl = examplesMap.get(prompt);
    if (!imageUrl) {
        console.warn(`Example "${prompt}" not found in EXAMPLES_MAP`);
        return null;
    }
    
    const card = document.createElement('div');
    card.className = 'example-card';
    card.style.animationDelay = `${index * 0.1}s`;
    
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = prompt;
    img.loading = 'lazy';
    
    const promptText = document.createElement('p');
    promptText.textContent = `"${prompt}"`;
    promptText.style.fontStyle = 'italic';
    promptText.style.fontSize = '0.9rem';
    promptText.style.color = 'var(--color-primary)';
    promptText.style.textAlign = 'center';
    promptText.style.margin = '0.5rem 0';
    
    card.appendChild(img);
    card.appendChild(promptText);
    
    card.addEventListener('click', () => {
        dom.userInput.value = prompt;
        dom.userInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        dom.userInput.focus();
        
        dom.userInput.style.animation = 'pulse 0.5s';
        setTimeout(() => {
            dom.userInput.style.animation = '';
        }, 500);
        
        showNotification('Generating your meme! 🎨', 'info');
    });
    
    return card;
}
