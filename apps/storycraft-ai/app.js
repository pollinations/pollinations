/**
 * StoryCraft AI — Powered by Pollinations.ai APIs
 * - Text Generation: https://text.pollinations.ai
 * - Image Generation: https://image.pollinations.ai
 */

const TEXT_API_BASE = "https://text.pollinations.ai";
const IMAGE_API_BASE = "https://image.pollinations.ai/prompt";

// State
let currentStory = null;
let currentChapterIndex = 0;
let isGenerating = false;

// DOM Elements
const storyForm = document.getElementById("story-form");
const storyPromptInput = document.getElementById("story-prompt");
const artStyleSelect = document.getElementById("art-style");
const chapterCountSelect = document.getElementById("chapter-count");
const textModelSelect = document.getElementById("text-model");
const imageModelSelect = document.getElementById("image-model");
const generateBtn = document.getElementById("generate-btn");
const statusCard = document.getElementById("status-card");
const statusTitle = document.getElementById("status-title");
const statusDesc = document.getElementById("status-desc");
const progressFill = document.getElementById("progress-fill");

const emptyState = document.getElementById("empty-state");
const storyContent = document.getElementById("story-content");
const storyTitleEl = document.getElementById("story-title");
const storyGenreEl = document.getElementById("story-genre");
const chapterNumberBadge = document.getElementById("chapter-number-badge");
const chapterHeading = document.getElementById("chapter-heading");
const chapterBody = document.getElementById("chapter-body");
const chapterImage = document.getElementById("chapter-image");
const imageLoader = document.getElementById("image-loader");
const prevChapterBtn = document.getElementById("prev-chapter-btn");
const nextChapterBtn = document.getElementById("next-chapter-btn");
const navDots = document.getElementById("nav-dots");
const copyStoryBtn = document.getElementById("copy-story-btn");
const regenerateImgBtn = document.getElementById("regenerate-img-btn");
const promptChips = document.querySelectorAll(".chip");

// Chip click fills input
promptChips.forEach((chip) => {
    chip.addEventListener("click", () => {
        storyPromptInput.value = chip.getAttribute("data-prompt");
        storyPromptInput.focus();
    });
});

// Form Submit Handler
storyForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isGenerating) return;

    const concept = storyPromptInput.value.trim();
    if (!concept) return;

    const artStyle = artStyleSelect.value;
    const chaptersCount = parseInt(chapterCountSelect.value, 10) || 4;
    const textModel = textModelSelect.value;
    const imageModel = imageModelSelect.value;

    await generateFullStory({
        concept,
        artStyle,
        chaptersCount,
        textModel,
        imageModel,
    });
});

/**
 * Generate Story Text using Pollinations Text API
 */
async function generateFullStory({
    concept,
    artStyle,
    chaptersCount,
    textModel,
    imageModel,
}) {
    setLoadingState(true);
    updateStatus(
        "🧠 Crafting Narrative...",
        "Sending prompt to Pollinations Text API...",
        25,
    );

    try {
        const systemPrompt = `You are a master storyteller and creative visual director. 
Create an engaging, structured story in exactly ${chaptersCount} chapters based on the user's idea.
You MUST reply strictly with a valid JSON object (no markdown surrounding code fences, no introductory text) matching this schema:
{
  "title": "A Creative Story Title",
  "genre": "Genre / Theme",
  "chapters": [
    {
      "chapterNumber": 1,
      "title": "Chapter Subtitle",
      "text": "Detailed paragraphs describing this chapter...",
      "visualScene": "A vivid 1-2 sentence description of this specific scene for an AI image generator focusing on subjects, lighting, environment"
    }
  ]
}`;

        const userPrompt = `Story Concept: ${concept}\nCreate ${chaptersCount} distinct chapters with vivid scene illustration prompts.`;

        // Direct call to Pollinations Text API
        const response = await fetch(
            `${TEXT_API_BASE}/${encodeURIComponent(userPrompt)}?model=${encodeURIComponent(textModel)}&system=${encodeURIComponent(systemPrompt)}&json=true`,
        );

        if (!response.ok) {
            throw new Error(
                `Text API responded with status ${response.status}`,
            );
        }

        const rawText = await response.text();
        let parsedStory;

        try {
            // Remove code block markers if returned
            const cleanJson = rawText
                .replace(/```json/gi, "")
                .replace(/```/g, "")
                .trim();
            parsedStory = JSON.parse(cleanJson);
        } catch (err) {
            console.warn("JSON parse fallback triggered:", err);
            // Simple fallback structure if strict JSON is slightly malformed
            parsedStory = {
                title: "Tales of the Journey",
                genre: "Adventure",
                chapters: [
                    {
                        chapterNumber: 1,
                        title: "The Beginning",
                        text: rawText.slice(0, 500),
                        visualScene: `${concept}, majestic lighting, cinematic scene`,
                    },
                ],
            };
        }

        updateStatus(
            "🎨 Preparing Scene Artwork...",
            "Generating illustrations via Pollinations Image API...",
            60,
        );

        // Attach image URLs for each chapter
        parsedStory.chapters = parsedStory.chapters.map((ch, idx) => {
            const seed = Math.floor(Math.random() * 1000000);
            const promptDescription =
                ch.visualScene || `${concept} - chapter ${idx + 1}`;
            const fullVisualPrompt = `${promptDescription}, ${artStyle}`;
            const imageUrl = `${IMAGE_API_BASE}/${encodeURIComponent(fullVisualPrompt)}?width=1024&height=1024&seed=${seed}&model=${encodeURIComponent(imageModel)}&nologo=true`;

            return {
                ...ch,
                seed,
                imageUrl,
                fullVisualPrompt,
            };
        });

        currentStory = parsedStory;
        currentChapterIndex = 0;

        updateStatus(
            "✨ Finalizing Storybook...",
            "All chapters assembled successfully!",
            100,
        );

        setTimeout(() => {
            setLoadingState(false);
            displayStory(currentStory);
        }, 600);
    } catch (error) {
        console.error("Story generation failed:", error);
        alert(
            `Could not generate story: ${error.message}. Please check your connection and try again.`,
        );
        setLoadingState(false);
    }
}

/**
 * Render Story into UI
 */
function displayStory(story) {
    emptyState.style.display = "none";
    storyContent.style.display = "block";

    storyTitleEl.textContent = story.title || "Illustrated Adventure";
    storyGenreEl.textContent = `Genre: ${story.genre || "Creative Fiction"}`;

    renderChapter(currentChapterIndex);
    setupNavDots(story.chapters.length);
}

/**
 * Render Single Chapter
 */
function renderChapter(index) {
    if (!currentStory?.chapters[index]) return;

    const chapter = currentStory.chapters[index];
    const total = currentStory.chapters.length;

    chapterNumberBadge.textContent = `Chapter ${index + 1} of ${total}`;
    chapterHeading.textContent = chapter.title || `Chapter ${index + 1}`;

    // Format text paragraphs
    const paragraphs = chapter.text
        .split("\n\n")
        .filter((p) => p.trim().length > 0);
    chapterBody.innerHTML = paragraphs
        .map((p) => `<p>${escapeHtml(p)}</p>`)
        .join("");

    // Load Image
    imageLoader.style.display = "flex";
    chapterImage.onload = () => {
        imageLoader.style.display = "none";
    };
    chapterImage.onerror = () => {
        imageLoader.style.display = "none";
    };
    chapterImage.src = chapter.imageUrl;

    // Update Nav Buttons
    prevChapterBtn.disabled = index === 0;
    nextChapterBtn.disabled = index === total - 1;

    // Update Active Dot
    document.querySelectorAll(".nav-dot").forEach((dot, dIdx) => {
        dot.classList.toggle("active", dIdx === index);
    });
}

/**
 * Setup Navigation Dots
 */
function setupNavDots(count) {
    navDots.innerHTML = "";
    for (let i = 0; i < count; i++) {
        const dot = document.createElement("div");
        dot.className = `nav-dot ${i === currentChapterIndex ? "active" : ""}`;
        dot.title = `Go to Chapter ${i + 1}`;
        dot.addEventListener("click", () => {
            currentChapterIndex = i;
            renderChapter(currentChapterIndex);
        });
        navDots.appendChild(dot);
    }
}

// Previous / Next Chapter Buttons
prevChapterBtn.addEventListener("click", () => {
    if (currentChapterIndex > 0) {
        currentChapterIndex--;
        renderChapter(currentChapterIndex);
    }
});

nextChapterBtn.addEventListener("click", () => {
    if (
        currentStory &&
        currentChapterIndex < currentStory.chapters.length - 1
    ) {
        currentChapterIndex++;
        renderChapter(currentChapterIndex);
    }
});

// Regenerate Image with new Seed
regenerateImgBtn.addEventListener("click", () => {
    if (!currentStory?.chapters[currentChapterIndex]) return;

    const chapter = currentStory.chapters[currentChapterIndex];
    const newSeed = Math.floor(Math.random() * 1000000);
    const imageModel = imageModelSelect.value;

    chapter.seed = newSeed;
    chapter.imageUrl = `${IMAGE_API_BASE}/${encodeURIComponent(chapter.fullVisualPrompt)}?width=1024&height=1024&seed=${newSeed}&model=${encodeURIComponent(imageModel)}&nologo=true`;

    imageLoader.style.display = "flex";
    chapterImage.src = chapter.imageUrl;
});

// Copy Story to Clipboard
copyStoryBtn.addEventListener("click", () => {
    if (!currentStory) return;

    let fullText = `${currentStory.title}\n${currentStory.genre}\n\n`;
    currentStory.chapters.forEach((ch) => {
        fullText += `--- ${ch.title} (Chapter ${ch.chapterNumber}) ---\n${ch.text}\n\n`;
    });
    fullText += `Generated with StoryCraft AI (Powered by Pollinations.ai)`;

    navigator.clipboard.writeText(fullText).then(() => {
        const originalText = copyStoryBtn.textContent;
        copyStoryBtn.textContent = "✅ Copied!";
        setTimeout(() => {
            copyStoryBtn.textContent = originalText;
        }, 2000);
    });
});

// UI Helper Functions
function setLoadingState(loading) {
    isGenerating = loading;
    generateBtn.disabled = loading;
    generateBtn.querySelector(".btn-text").style.display = loading
        ? "none"
        : "block";
    generateBtn.querySelector(".loader").style.display = loading
        ? "inline-block"
        : "none";
    statusCard.style.display = loading ? "flex" : "none";
}

function updateStatus(title, desc, progress) {
    statusTitle.textContent = title;
    statusDesc.textContent = desc;
    progressFill.style.width = `${progress}%`;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}
