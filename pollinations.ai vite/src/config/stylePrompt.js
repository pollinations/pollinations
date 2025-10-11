import { Colors } from "./global";

export const getDefaultPrompt = (text, isWhiteBG = true) => {
    const foregroundColor =
        typeof isWhiteBG === "string"
            ? isWhiteBG
            : isWhiteBG
              ? Colors.offwhite
              : Colors.offblack;
    const backgroundColor =
        typeof isWhiteBG === "string"
            ? Colors.offblack
            : isWhiteBG
              ? Colors.offblack
              : Colors.offwhite;

    return `An image with the text "${text}" displayed in an elegant, decorative serif font. The font has high contrast between thick and thin strokes, giving the text a sophisticated and stylized appearance. The text is in ${foregroundColor}, set against a solid ${backgroundColor} background, creating a striking and bold visual contrast. Incorporate elements related to ancient Egyptian motifs, such as Ankhs, Eye of Horus, scarabs, lotus, and hieroglyphs into the design of the font. Each letter features unique, creative touches that make the typography stand out. Incorporate elements related to these motifs, making it very colorful with vibrant hues and gradients.`;
};
