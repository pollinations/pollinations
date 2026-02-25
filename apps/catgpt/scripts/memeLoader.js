// Meme Loading and Display

import { dom } from './ui.js';
import { getSavedMemes } from './storage.js';
import { createUserMemeCard, createExampleCard } from './cards.js';
import { EXAMPLES_MAP } from './config.js';

export function loadUserMemes() {
    dom.yourMemesGrid.innerHTML = '';
    
    const savedMemes = getSavedMemes();
    
    if (savedMemes.length === 0) {
        const emptyMessage = document.createElement('p');
        emptyMessage.textContent = 'No memes yet! Generate one to see it here. 🎨';
        emptyMessage.style.cssText = `
            grid-column: 1 / -1;
            text-align: center;
            color: var(--color-secondary);
            padding: 2rem;
            font-style: italic;
        `;
        dom.yourMemesGrid.appendChild(emptyMessage);
        return;
    }
    
    savedMemes.forEach((meme, index) => {
        const card = createUserMemeCard(meme.prompt, index, meme.url);
        if (card) dom.yourMemesGrid.appendChild(card);
    });
}

export function loadExamples() {
    dom.examplesGrid.innerHTML = '';
    
    const examplePrompts = Array.from(EXAMPLES_MAP.keys());
    examplePrompts.forEach((prompt, index) => {
        const card = createExampleCard(prompt, index, EXAMPLES_MAP);
        if (card) dom.examplesGrid.appendChild(card);
    });
}

export function refreshExamples() {
    loadUserMemes();
    loadExamples();
}
