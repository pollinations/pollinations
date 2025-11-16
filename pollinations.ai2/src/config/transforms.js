// Text transformation functions
// Each returns an instruction string or null

export const translate = ({ userLanguage }) =>
    userLanguage?.startsWith("en") ? null : `Translate to: ${userLanguage}`;

export const rephrase = () =>
    `Formulate with a direct, friendly but professional tone. Preserve clarity and conciseness.`;

export const emojify = () =>
    `Enrich the text with suitable emojis and varied text styles (use bold and italics). Do not rephrase.`;

export const responsive = ({ isMobile }) =>
    isMobile
        ? `Condense the text to 5 words maximum for mobile. Keep it super short!`
        : null;

export const noLink = () => `Do not use any link URLs`;

export const keepOriginal = () =>
    `Use the text exactly as provided without any changes`;
