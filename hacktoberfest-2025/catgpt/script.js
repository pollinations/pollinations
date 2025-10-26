// CatGPT Meme Generator Script 🐱✨
// Note: AI functionality is now provided by ai.js

// Image upload handler
let uploadedImageUrl = null;

// Image upload functions are now provided by ai.js
// Using handleImageUpload from ai.js with showNotification callback

// CatGPT prompt creation is now provided by ai.js

// Example memes for the gallery
const EXAMPLES = [
    { prompt: "How many R's in strawberry?", imageUrl: null },
    { prompt: "running late...", imageUrl: null },
    { prompt: "I told the KGB about you", imageUrl: null },
    { prompt: "What's inside the washing machine?", imageUrl: null },
    { prompt: "What is my horoscope? I am gemini. And don't say napping", imageUrl: null },
    { prompt: "what is the answer to life and the universe?", imageUrl: null },
    { prompt: "Should I take up the offer for a new job?", imageUrl: null },
    { prompt: "Can you help me exercise?", imageUrl: null },
    { prompt: "Where should we eat in Palermo Sicily?", imageUrl: null },
    { prompt: "Why do boxes call to me?", imageUrl: null },
    { prompt: "Can you communicate with dolphins?", imageUrl: null },
    { prompt: "Why do keyboards attract fur?", imageUrl: null },
    { prompt: "What's the weather today?", imageUrl: null },
    { prompt: "How do I fix this bug?", imageUrl: null },
    { prompt: "What should I eat for dinner?", imageUrl: null },
    { prompt: "What's the meaning of life?", imageUrl: null },
    { prompt: "How do I get motivated?", imageUrl: null },
    { prompt: "Why is my code not working?", imageUrl: null }
];

// Image URL generation is now provided by ai.js
// Note: Using generateImageURL(prompt, uploadedImageUrl) from ai.js

// LocalStorage functions for user-generated memes
function saveGeneratedPrompt(prompt) {
    const saved = getSavedPrompts();
    
    // Create object with prompt and image URL (if exists)
    const promptData = {
        prompt: prompt,
        imageUrl: uploadedImageUrl || null
    };
    
    // Add to beginning, remove duplicates, limit to 8 items
    // Check if prompt text already exists to avoid duplicates
    const updated = [
        promptData, 
        ...saved.filter(item => item.prompt !== prompt)
    ].slice(0, 8);
    
    localStorage.setItem('catgpt-v-3-generated', JSON.stringify(updated));
}

function getSavedPrompts() {
    try {
        const savedData = JSON.parse(localStorage.getItem('catgpt-v-3-generated')) || [];
        
        // Handle backward compatibility with old format (strings instead of objects)
        return savedData.map(item => {
            // If the item is a string (old format), convert to object format
            if (typeof item === 'string') {
                return { prompt: item, imageUrl: null };
            }
            // Otherwise return the item as is (already in object format)
            return item;
        });
    } catch {
        return [];
    }
}

// URL parameter handling for shared prompts
function getURLPrompt() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('prompt');
}

// Get image URL from parameters
function getURLImage() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('image');
}

function setURLPrompt(prompt, imageUrl = null) {
    const url = new URL(window.location);
    
    // Handle prompt parameter
    if (prompt) {
        url.searchParams.set('prompt', prompt);
        
        // Add image parameter if we have an uploaded image
        if (uploadedImageUrl) {
            url.searchParams.set('image', uploadedImageUrl);
        } else {
            url.searchParams.delete('image');
        }
    } else {
        url.searchParams.delete('prompt');
        url.searchParams.delete('image');
    }
    
    window.history.replaceState({}, '', url);
}

function handleURLPrompt() {
    const urlPrompt = getURLPrompt();
    const urlImage = getURLImage();
    
    // If there's an image URL in the parameters, use it and show thumbnail
    if (urlImage) {
        uploadedImageUrl = urlImage;
        showThumbnail(urlImage);
    }
    
    if (urlPrompt) {
        userInput.value = urlPrompt;
        // Auto-generate the meme if prompt is in URL
        setTimeout(() => {
            generateMeme();
        }, 500);
    }
}

// DOM Elements
const userInput = document.getElementById('userInput');
const generateBtn = document.getElementById('generateBtn');
const loadingIndicator = document.getElementById('loadingIndicator');
const resultSection = document.getElementById('resultSection');
const generatedMeme = document.getElementById('generatedMeme');
const downloadBtn = document.getElementById('downloadBtn');
const shareBtn = document.getElementById('shareBtn');
const examplesGrid = document.getElementById('examplesGrid');

// Image upload elements
const imageUpload = document.getElementById('imageUpload');
const imageUploadContainer = document.getElementById('imageUploadContainer');
const imageThumbnailContainer = document.getElementById('imageThumbnailContainer');
const imageThumbnail = document.getElementById('imageThumbnail');
const removeImageBtn = document.getElementById('removeImageBtn');

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    loadExamples();
    loadRandomCatFact();
    handleURLPrompt(); // Handle URL prompt if present
    
    // Add event listeners
    generateBtn.addEventListener('click', generateMeme);
    downloadBtn.addEventListener('click', downloadMeme);
    shareBtn.addEventListener('click', shareMeme);
    
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            generateMeme();
        }
    });
    
    // Image upload event listener
    imageUpload.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            const fileName = file.name;
            const fileSize = (file.size / 1024 / 1024).toFixed(2);
            
            // Show preview of selected file
            const objectUrl = URL.createObjectURL(file);
            showThumbnail(objectUrl);
            
            showNotification(`Selected: ${fileName} (${fileSize}MB)`, 'info');
        } else {
            uploadedImageUrl = null;
            hideThumbnail();
        }
    });
    
    // Remove image button event listener
    removeImageBtn.addEventListener('click', () => {
        uploadedImageUrl = null;
        imageUpload.value = '';
        hideThumbnail();
        showNotification('Image removed', 'info');
    });
    
        // Add some fun to the page
    addFloatingEmojis();
});

// Show thumbnail preview of uploaded image
function showThumbnail(imageUrl) {
    // Set the thumbnail image source
    imageThumbnail.src = imageUrl;
    
    // Show the thumbnail container and hide the file input
    imageUploadContainer.classList.add('hidden');
    imageThumbnailContainer.classList.remove('hidden');
}

// Hide thumbnail preview and show file input
function hideThumbnail() {
    // Clear the thumbnail image source
    imageThumbnail.src = '';
    
    // Hide the thumbnail container and show the file input
    imageThumbnailContainer.classList.add('hidden');
    imageUploadContainer.classList.remove('hidden');
}

// Generate meme function
async function generateMeme() {
    const userQuestion = userInput.value.trim();
    
    if (!userQuestion) {
        showNotification('Please enter a question for CatGPT! 😸', 'warning');
        return;
    }
    
    // Handle image upload if file selected
    const imageFile = imageUpload.files[0];
    
    // Only try to upload a new image if there's a file in the input
    // This preserves the existing uploadedImageUrl during retries
    if (imageFile) {
        generateBtn.disabled = true;
        generateBtn.innerHTML = '📤 Uploading image...';
        
        try {
            uploadedImageUrl = await handleImageUpload(imageFile, showNotification);
            if (!uploadedImageUrl) {
                // Image upload failed, enable button and return
                resetButton();
                return;
            }
            
            // Show thumbnail of the uploaded image
            showThumbnail(uploadedImageUrl);
        } catch (error) {
            showNotification('Failed to upload image. Using default CatGPT style.', 'warning');
            uploadedImageUrl = null;
            hideThumbnail();
        }
    }
    
    // Debug log to confirm we still have the image URL
    console.log('Using image URL:', uploadedImageUrl);
    
    // Update URL immediately when prompt is submitted
    setURLPrompt(userQuestion);
    
    // Show loading state with disabled button
    generateBtn.disabled = true;
    generateBtn.innerHTML = '🐾 Generating... (~30s)';
    generateBtn.style.opacity = '0.6';
    generateBtn.style.cursor = 'not-allowed';
    
    loadingIndicator.classList.remove('hidden');
    resultSection.classList.add('hidden');
    
    // Start fake Gen-Z progress
    startFakeProgress();
    
    // Start cat animation during loading
    startCatAnimation();
    
    // Create the full prompt using utility function - pass if we have an uploaded image
    const fullPrompt = createCatGPTPrompt(userQuestion, !!uploadedImageUrl);
    
    try {
        // Generate the image URL using utility function from ai.js
        const imageUrl = generateImageURL(fullPrompt, uploadedImageUrl);
        
        // Create a new image element to handle loading
        const img = new Image();
        
        img.onload = () => {
            // Update UI with generated image
            generatedMeme.src = imageUrl;
            generatedMeme.alt = `CatGPT response to: ${userQuestion}`;
            
            // Show result section
            loadingIndicator.classList.add('hidden');
            resultSection.classList.remove('hidden');
            resetButton();
            
            // Save the prompt for future examples
            saveGeneratedPrompt(userQuestion);
            
            // Add a little celebration
            celebrate();
        };
        
        img.onerror = () => {
            // Image failed to load, trigger retry system
            console.log('Image failed to load, triggering retry');
            resetButton();
            // Start the retry countdown
            startRetryCountdown();
        };
        
        img.src = imageUrl;
        
    } catch (error) {
        console.error('Error generating meme:', error);
        resetButton();
        handleImageError('general');
    }
}

// Handle image loading errors with funny cat messages
function handleImageError(errorType = 'general') {
    const catMessages = [
        "😾 *yawns* The art studio is full of sleeping cats... try again in 30 seconds!",
        "🐱 *stretches paws* Too many humans asking questions! I need a catnap... wait 30 seconds, please.",
        "😸 *knocks over coffee* Oops! The meme machine broke. Give me 30 seconds to fix it with my paws.",
        "🙄 *rolls eyes* Seriously? Another request? The queue is fuller than my food bowl... try in 30 seconds.",
        "😴 *curls up* All the AI cats are napping right now. Check back in 30 seconds, human.",
        "🐾 *walks across keyboard* Purrfect timing... NOT. The servers are as full as a litter box. 30 seconds!",
        "😼 *flicks tail dismissively* The internet tubes are clogged with cat hair. Try again in 30 seconds.",
        "🎨 *knocks over paint* My artistic genius is in high demand! Wait your turn... 30 seconds, human."
    ];
    
    const randomMessage = catMessages[Math.floor(Math.random() * catMessages.length)];
    
    let specificMessage;
    if (errorType === 'timeout') {
        specificMessage = "⏰ This cat took too long to respond... probably distracted by a laser pointer! " + randomMessage;
    } else {
        specificMessage = randomMessage;
    }
    
    showNotification(specificMessage, 'error');
    stopCatAnimation(); // Stop the cat animation on error
    
    // Start automatic retry countdown
    startRetryCountdown();
}

// Auto-retry with Gen-Z countdown
function startRetryCountdown() {
    let countdown = 10;
    
    // Start different cat animation for retry state
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
    
    // Countdown timer
    const countdownInterval = setInterval(() => {
        countdown--;
        countdownDisplay.textContent = countdown;
        
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            retryContainer.remove();
            stopCatAnimation(); // Stop retry cats
            // Auto-retry
            generateMeme();
        }
    }, 1000);
    
    // Cancel button
    cancelBtn.addEventListener('click', () => {
        clearInterval(countdownInterval);
        retryContainer.remove();
        stopCatAnimation(); // Stop retry cats when cancelled
    });
    
    // Initial countdown display
    countdownDisplay.textContent = countdown;
}

// Cat animation during loading
let catAnimationInterval;

function startCatAnimation(mode = 'loading') {
    const loadingCatEmojis = ['🐱', '😺', '😸', '😹', '😻', '🙀', '😿', '😾', '🐈', '🐈‍⬛'];
    const retryCatEmojis = ['😾', '😿', '🙄', '😤', '😑', '😒', '😔', '🐱‍👤', '😸', '😼'];
    
    const catEmojis = mode === 'retry' ? retryCatEmojis : loadingCatEmojis;
    const speed = mode === 'retry' ? 800 : 400; // Slower for retry state
    
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
        
        cat.textContent = catEmojis[Math.floor(Math.random() * catEmojis.length)];
        document.body.appendChild(cat);
        
        // Remove after animation
        setTimeout(() => {
            if (cat.parentNode) {
                cat.remove();
            }
        }, 6000);
    }, speed);
}

function stopCatAnimation() {
    if (catAnimationInterval) {
        clearInterval(catAnimationInterval);
        catAnimationInterval = null;
    }
    
    // Remove any existing cats
    document.querySelectorAll('[style*="catSlide"]').forEach(cat => cat.remove());
}

// Reset button to original state
function resetButton() {
    generateBtn.disabled = false;
    generateBtn.innerHTML = `
        <span class="btn-text">Generate Meme</span>
        <span class="btn-emoji">🎨</span>
    `;
    generateBtn.style.opacity = '';
    generateBtn.style.cursor = '';
    
    // Only clear the file input, but DON'T reset the uploadedImageUrl
    // This allows the image URL to persist during retries
    imageUpload.value = '';
    
    loadingIndicator.classList.add('hidden');
    stopFakeProgress();
    stopCatAnimation(); // Stop the cat animation on reset
}

// Fake Gen-Z progress messages
let progressInterval;
let progressStep = 0;

function startFakeProgress() {
    const progressMessages = [
        "🧠 Waking up CatGPT... (this cat is sleepy)",
        "☕ Brewing digital coffee for maximum sass...",
        "🎨 Sketching with chaotic energy...",
        "😼 Teaching AI the art of being unimpressed...",
        "📝 Writing sarcastic responses in Comic Sans...",
        "🌙 Channeling midnight cat energy...",
        "✨ Sprinkling some magic dust...",
        "🎯 Perfecting the level of 'couldn't care less'...",
        "🔥 Making it fire (but like, ironically)...",
        "🎭 Adding just the right amount of drama...",
        "💅 Polishing those aloof vibes...",
        "🚀 Almost done! (CatGPT doesn't rush for anyone)"
    ];
    
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
    
    loadingIndicator.appendChild(progressText);
    
    // Update progress every 2.5 seconds
    progressInterval = setInterval(() => {
        if (progressStep < progressMessages.length) {
            progressText.textContent = progressMessages[progressStep];
            progressStep++;
        } else {
            progressText.textContent = "🎨 Finalizing your masterpiece...";
        }
    }, 2500);
    
    // Start with first message immediately
    progressText.textContent = progressMessages[0];
    progressStep = 1;
}

function stopFakeProgress() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
    const progressText = document.getElementById('progress-text');
    if (progressText) {
        progressText.remove();
    }
}

// Show the result
function showResult() {
    resultSection.classList.remove('hidden');
    
    // Smooth scroll to result
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Add celebration animation
    celebrate();
}

// Download meme
async function downloadMeme() {
    try {
        const response = await fetch(generatedMeme.src);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `catgpt-meme-${Date.now()}.png`;
        link.click();
        window.URL.revokeObjectURL(url);
        
        showNotification('Meme downloaded! 🎉', 'success');
    } catch (error) {
        console.error('Download failed:', error);
        showNotification('Download failed! Try right-clicking and save image instead.', 'error');
    }
}


async function shareMeme() {
    if (!generatedMeme.src || generatedMeme.src === '') {
        showNotification('Generate a meme first! 🎨', 'warning');
        return;
    }
    
    const currentURL = window.location.href;
    
    try {
        // Copy URL to clipboard
        await navigator.clipboard.writeText(currentURL);
        showNotification('Link copied to clipboard! 📋', 'success');
    } catch (error) {
        console.error('Error copying to clipboard:', error);
        showNotification('Could not copy link. Try copying it manually! 🔗', 'error');
    }
}



// Load example memes
function loadExamples() {
    // Clear existing examples
    examplesGrid.innerHTML = '';
    
    // Get saved prompts and combine with default examples
    const savedPrompts = getSavedPrompts();
    
    // Combine saved prompts with default examples (now both using the same object format)
    const allPrompts = [...savedPrompts, ...EXAMPLES];
    
    // Create cards for each prompt
    allPrompts.forEach((promptData, index) => {
        const card = createExampleCard(promptData, index, index < savedPrompts.length);
        examplesGrid.appendChild(card);
    });
}

// Refresh examples (useful after generating new memes)
function refreshExamples() {
    loadExamples();
}

// Create example card
function createExampleCard(promptData, index, isUserGenerated = false) {
    // Handle both new format (object with prompt and imageUrl) and old format (string)
    const promptValue = typeof promptData === 'string' ? promptData : promptData.prompt;
    const customImageUrl = typeof promptData === 'object' ? promptData.imageUrl : null;
    
    const card = document.createElement('div');
    card.className = 'example-card';
    card.style.animationDelay = `${index * 0.1}s`;
    
    // Add special styling for user-generated prompts
    if (isUserGenerated) {
        card.style.border = '2px solid var(--color-accent)';
        card.style.boxShadow = '0 0 10px rgba(255, 105, 180, 0.3)';
    }
    
    // Generate dynamic image URL using utility functions
    const examplePrompt = createCatGPTPrompt(promptValue, !!customImageUrl);
    
    // If the example has a custom image URL, use it in generateImageURL
    let tempUploadedImageUrl = null;
    if (customImageUrl) {
        // Temporarily save the current uploadedImageUrl
        tempUploadedImageUrl = uploadedImageUrl;
        // Set uploadedImageUrl to the example's custom image
        uploadedImageUrl = customImageUrl;
    }
    
    // Generate the image URL using ai.js function
    const imageUrl = generateImageURL(examplePrompt, customImageUrl);
    
    // Restore the original uploadedImageUrl if we modified it
    if (customImageUrl) {
        uploadedImageUrl = tempUploadedImageUrl;
    }
    
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = promptValue;
    img.loading = 'lazy';
    
    const promptElement = document.createElement('p');
    promptElement.textContent = `"${promptValue}"`;
    promptElement.style.fontStyle = 'italic';
    promptElement.style.fontSize = '0.9rem';
    promptElement.style.color = 'var(--color-primary)';
    promptElement.style.textAlign = 'center';
    promptElement.style.margin = '0.5rem 0';
    
    // Add "Your Meme" badge for user-generated content
    if (isUserGenerated) {
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
        card.appendChild(badge);
    }
    
    card.appendChild(img);
    card.appendChild(promptElement);
    
    // Add image icon badge if it has a custom image
    if (customImageUrl) {
        const imageBadge = document.createElement('div');
        imageBadge.textContent = '🖼️ Custom Image';
        imageBadge.style.cssText = `
            background: var(--gradient-2);
            color: white;
            padding: 0.2rem 0.5rem;
            border-radius: 10px;
            font-size: 0.7rem;
            font-weight: bold;
            margin-top: 0.5rem;
            text-align: center;
        `;
        card.appendChild(imageBadge);
    }
    
    // Click to use this prompt and image (if available)
    card.addEventListener('click', () => {
        // Set the prompt text in the input
        userInput.value = promptValue;
        userInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        userInput.focus();
        
        // Set the image URL if this example has one
        if (customImageUrl) {
            uploadedImageUrl = customImageUrl;
            showThumbnail(customImageUrl);
            showNotification('Using custom image from example 🖼️', 'info');
        } else {
            // If no custom image, clear any existing one
            uploadedImageUrl = null;
            hideThumbnail();
        }
        
        // Add a little animation to the input
        userInput.style.animation = 'pulse 0.5s';
        setTimeout(() => {
            userInput.style.animation = '';
        }, 500);
        
        showNotification('Generating your meme! 🎨', 'info');
        
        // Auto-generate the meme after a short delay
        setTimeout(() => {
            generateMeme();
        }, 800);
    });
    
    return card;
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Styles for notification
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        background: ${type === 'success' ? '#05ffa1' : type === 'error' ? '#ff61d8' : '#ffcc00'};
        color: #000;
        border-radius: 10px;
        font-weight: 600;
        box-shadow: 0 5px 20px rgba(0, 0, 0, 0.2);
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// Celebration animation
function celebrate() {
    const emojis = ['🎉', '✨', '🌟', '💫', '🎊'];
    const colors = ['#ff61d8', '#05ffa1', '#ffcc00'];
    
    for (let i = 0; i < 20; i++) {
        setTimeout(() => {
            const emoji = document.createElement('div');
            emoji.textContent = emojis[Math.floor(Math.random() * emojis.length)];
            emoji.style.cssText = `
                position: fixed;
                font-size: ${20 + Math.random() * 20}px;
                color: ${colors[Math.floor(Math.random() * colors.length)]};
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

// Add floating emojis for fun
function addFloatingEmojis() {
    const emojis = ['🐱', '💭', '✨', '🌟', '😸', '🐾', '💜', '🎨'];
    const container = document.querySelector('.container');
    
    emojis.forEach((emoji, index) => {
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

// Easter egg: Konami code
let konamiCode = [];
const konamiSequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

document.addEventListener('keydown', (e) => {
    konamiCode.push(e.key);
    konamiCode = konamiCode.slice(-10);
    
    if (konamiCode.join(',') === konamiSequence.join(',')) {
        document.body.style.animation = 'rainbow 2s';
        showNotification('🌈 Secret mode activated! You found the easter egg! 🦄', 'success');
        celebrate();
        
        // Add special cat mode
        document.querySelectorAll('h1, h2, h3').forEach(el => {
            el.innerHTML = el.innerHTML.replace(/Cat/g, '😸Cat😸');
        });
        
        setTimeout(() => {
            document.body.style.animation = '';
        }, 2000);
    }
});

// Add random cat facts
const catFacts = [
    "Cats spend 70% of their lives sleeping 😴",
    "A group of cats is called a 'clowder' 🐱🐱🐱",
    "Cats have over 20 vocalizations 🎵",
    "The first cat in space was French 🚀",
    "Cats can rotate their ears 180 degrees 👂"
];

// Load random cat fact
function loadRandomCatFact() {
    setTimeout(() => {
        const randomFact = catFacts[Math.floor(Math.random() * catFacts.length)];
        showNotification(`Did you know? ${randomFact}`, 'info');
    }, 3000);
}

// Add CSS animations
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
`;
document.head.appendChild(style);

// Add rainbow animation
const rainbowStyle = document.createElement('style');
rainbowStyle.textContent = `
    @keyframes rainbow {
        0% { filter: hue-rotate(0deg); }
        100% { filter: hue-rotate(360deg); }
    }
`;
document.head.appendChild(rainbowStyle);
