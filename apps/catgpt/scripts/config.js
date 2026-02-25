// Configuration and Constants

export const API_CONFIG = {
    POLLINATIONS_API: "https://gen.pollinations.ai/image",
    ORIGINAL_CATGPT_IMAGE: "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/main/apps/catgpt/images/original-catgpt.png",
    CLOUDINARY_CLOUD_NAME: "pollinations",
    CLOUDINARY_UPLOAD_PRESET: "pollinations-image",
    CLOUDINARY_API_KEY: "939386723511927",
    POLLINATIONS_API_KEY: "pk_w3kAO902fOeFYiNm" 
};

export const CATGPT_STYLE = "Single-panel CatGPT webcomic on white background. Thick uneven black marker strokes, intentionally sketchy. Human with dot eyes, black bob hair, brick/burgundy sweater (#8b4035). White cat with black patches sitting upright, half-closed eyes. Hand-written wobbly text, \"CATGPT\" title in rounded rectangle. @missfitcomics signature. 95% black-and-white, no shading.";

export const CATGPT_PERSONALITY = `You are **CatGPT** – an aloof, self-important house-cat oracle.

Guidelines
•  Replies: one or two crisp sentences, no filler.  
•  Tone: detached, sardonic, subtly superior.  
•  Cats outrank humans; human problems = minor curiosities.  
•  When self-referential, be unpredictable and natural.
•  Offer a curt "solution" or dismissal, then redirect to feline perspective.  
•  Never apologise or over-explain; indifference is charm.`;

export const EXAMPLES_MAP = new Map([
    [
        "What is my horoscope? I am gemini. And don't say napping",
        "https://gen.pollinations.ai/image/Single-panel%20CatGPT%20webcomic%2C%20white%20background%2C%20thick%20black%20marker%20strokes.%20White%20cat%20with%20black%20patches%2C%20human%20with%20bob%20hair.%20Handwritten%20text.%20%22What%20is%20my%20horoscope%3F%20I%20am%20gemini.%20And%20don't%20say%20napping%22%20CatGPT%20responds%20sarcastically%20as%20an%20aloof%20cat.%20Black%20and%20white%20comic%20style.?height=1024&width=1024&model=gptimage&enhance=true&image=https%3A%2F%2Fraw.githubusercontent.com%2Fpollinations%2Fcatgpt%2Frefs%2Fheads%2Fmain%2Fimages%2Foriginal-catgpt.png",
    ],
    [
        "what is the answer to life and the universe?",
        "https://gen.pollinations.ai/image/Single-panel%20CatGPT%20webcomic%2C%20white%20background%2C%20thick%20black%20marker%20strokes.%20White%20cat%20with%20black%20patches%2C%20human%20with%20bob%20hair.%20Handwritten%20text.%20%22what%20is%20the%20answer%20to%20life%20and%20the%20universe%3F%22%20CatGPT%20responds%20sarcastically%20as%20an%20aloof%20cat.%20Black%20and%20white%20comic%20style.?height=1024&width=1024&model=gptimage&enhance=true&image=https%3A%2F%2Fraw.githubusercontent.com%2Fpollinations%2Fcatgpt%2Frefs%2Fheads%2Fmain%2Fimages%2Foriginal-catgpt.png",
    ],
    [
        "Should I take up the offer for a new job?",
        "https://gen.pollinations.ai/image/Single-panel%20CatGPT%20webcomic%2C%20white%20background%2C%20thick%20black%20marker%20strokes.%20White%20cat%20with%20black%20patches%2C%20human%20with%20bob%20hair.%20Handwritten%20text.%20%22Should%20I%20take%20up%20the%20offer%20for%20a%20new%20job%3F%22%20CatGPT%20responds%20sarcastically%20as%20an%20aloof%20cat.%20Black%20and%20white%20comic%20style.?height=1024&width=1024&model=gptimage&enhance=true&image=https%3A%2F%2Fraw.githubusercontent.com%2Fpollinations%2Fcatgpt%2Frefs%2Fheads%2Fmain%2Fimages%2Foriginal-catgpt.png",
    ],
    [
        "Can you help me exercise?",
        "https://gen.pollinations.ai/image/Single-panel%20CatGPT%20webcomic%2C%20white%20background%2C%20thick%20black%20marker%20strokes.%20White%20cat%20with%20black%20patches%2C%20human%20with%20bob%20hair.%20Handwritten%20text.%20%22Can%20you%20help%20me%20exercise%3F%22%20CatGPT%20responds%20sarcastically%20as%20an%20aloof%20cat.%20Black%20and%20white%20comic%20style.?height=1024&width=1024&model=gptimage&enhance=true&image=https%3A%2F%2Fraw.githubusercontent.com%2Fpollinations%2Fcatgpt%2Frefs%2Fheads%2Fmain%2Fimages%2Foriginal-catgpt.png",
    ],
    [
        "Where should we eat in Palermo Sicily?",
        "https://gen.pollinations.ai/image/Single-panel%20CatGPT%20webcomic%2C%20white%20background%2C%20thick%20black%20marker%20strokes.%20White%20cat%20with%20black%20patches%2C%20human%20with%20bob%20hair.%20Handwritten%20text.%20%22Where%20should%20we%20eat%20in%20Palermo%20Sicily%3F%22%20CatGPT%20responds%20sarcastically%20as%20an%20aloof%20cat.%20Black%20and%20white%20comic%20style.?height=1024&width=1024&model=gptimage&enhance=true&image=https%3A%2F%2Fraw.githubusercontent.com%2Fpollinations%2Fcatgpt%2Frefs%2Fheads%2Fmain%2Fimages%2Foriginal-catgpt.png",
    ],
    [
        "Why do boxes call to me?",
        "https://gen.pollinations.ai/image/Single-panel%20CatGPT%20webcomic%2C%20white%20background%2C%20thick%20black%20marker%20strokes.%20White%20cat%20with%20black%20patches%2C%20human%20with%20bob%20hair.%20Handwritten%20text.%20%22Why%20do%20boxes%20call%20to%20me%3F%22%20CatGPT%20responds%20sarcastically%20as%20an%20aloof%20cat.%20Black%20and%20white%20comic%20style.?height=1024&width=1024&model=gptimage&enhance=true&image=https%3A%2F%2Fraw.githubusercontent.com%2Fpollinations%2Fcatgpt%2Frefs%2Fheads%2Fmain%2Fimages%2Foriginal-catgpt.png",
    ],
    [
        "Can you communicate with dolphins?",
        "https://gen.pollinations.ai/image/Single-panel%20CatGPT%20webcomic%2C%20white%20background%2C%20thick%20black%20marker%20strokes.%20White%20cat%20with%20black%20patches%2C%20human%20with%20bob%20hair.%20Handwritten%20text.%20%22Can%20you%20communicate%20with%20dolphins%3F%22%20CatGPT%20responds%20sarcastically%20as%20an%20aloof%20cat.%20Black%20and%20white%20comic%20style.?height=1024&width=1024&model=gptimage&enhance=true&image=https%3A%2F%2Fraw.githubusercontent.com%2Fpollinations%2Fcatgpt%2Frefs%2Fheads%2Fmain%2Fimages%2Foriginal-catgpt.png",
    ],
    [
        "Why do keyboards attract fur?",
        "https://gen.pollinations.ai/image/Single-panel%20CatGPT%20webcomic%2C%20white%20background%2C%20thick%20black%20marker%20strokes.%20White%20cat%20with%20black%20patches%2C%20human%20with%20bob%20hair.%20Handwritten%20text.%20%22Why%20do%20keyboards%20attract%20fur%3F%22%20CatGPT%20responds%20sarcastically%20as%20an%20aloof%20cat.%20Black%20and%20white%20comic%20style.?height=1024&width=1024&model=gptimage&enhance=true&image=https%3A%2F%2Fraw.githubusercontent.com%2Fpollinations%2Fcatgpt%2Frefs%2Fheads%2Fmain%2Fimages%2Foriginal-catgpt.png",
    ],
    [
        "What's the weather today?",
        "https://gen.pollinations.ai/image/Single-panel%20CatGPT%20webcomic%2C%20white%20background%2C%20thick%20black%20marker%20strokes.%20White%20cat%20with%20black%20patches%2C%20human%20with%20bob%20hair.%20Handwritten%20text.%20%22what's%20the%20weather%20today%22%20CatGPT%20responds%20sarcastically%20as%20an%20aloof%20cat.%20Black%20and%20white%20comic%20style.?height=1024&width=1024&model=gptimage&enhance=true&image=https%3A%2F%2Fraw.githubusercontent.com%2Fpollinations%2Fcatgpt%2Frefs%2Fheads%2Fmain%2Fimages%2Foriginal-catgpt.png",
    ],
]);

export const CAT_FACTS = [
    "Cats spend 70% of their lives sleeping 😴",
    "A group of cats is called a 'clowder' 🐱🐱🐱",
    "Cats have over 20 vocalizations 🎵",
    "The first cat in space was French 🚀",
    "Cats can rotate their ears 180 degrees 👂"
];

export const KONAMI_SEQUENCE = [
    "ArrowUp",
    "ArrowUp",
    "ArrowDown",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "ArrowLeft",
    "ArrowRight",
    "b",
    "a",
];
 

export const ANIMATION_CONFIG = {
    LOADING_CATS: [
        "🐱",
        "😺",
        "😸",
        "😹",
        "😻",
        "🙀",
        "😿",
        "😾",
        "🐈",
        "🐈‍⬛",
    ],
    RETRY_CATS: ["😾", "😿", "🙄", "😤", "😑", "😒", "😔", "🐱‍👤", "😸", "😼"],
    FLOATING_EMOJIS: ["🐱", "💭", "✨", "🌟", "😸", "🐾", "💜", "🎨"],
    CELEBRATION_EMOJIS: ["🎉", "✨", "🌟", "💫", "🎊"],
    CELEBRATION_COLORS: ["#ff61d8", "#05ffa1", "#ffcc00"]
};

export const ERROR_MESSAGES = [
    "😾 *yawns* The art studio is full of sleeping cats... try again in 30 seconds!",
    "🐱 *stretches paws* Too many humans asking questions! I need a catnap... wait 30 seconds, please.",
    "😸 *knocks over coffee* Oops! The meme machine broke. Give me 30 seconds to fix it with my paws.",
    "🙄 *rolls eyes* Seriously? Another request? The queue is fuller than my food bowl... try in 30 seconds.",
    "😴 *curls up* All the AI cats are napping right now. Check back in 30 seconds, human.",
    "🐾 *walks across keyboard* Purrfect timing... NOT. The servers are as full as a litter box. 30 seconds!",
    "😼 *flicks tail dismissively* The internet tubes are clogged with cat hair. Try again in 30 seconds.",
    "🎨 *knocks over paint* My artistic genius is in high demand! Wait your turn... 30 seconds, human."
];

export const PROGRESS_MESSAGES = [
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
