export const getDefaultPrompt = (text, whiteText = true) => {
    const foregroundColor =
      typeof whiteText === "string" ? whiteText : whiteText ? "white" : "black";
    const backgroundColor =
      typeof whiteText === "string" ? "black" : whiteText ? "black" : "white";
  
  
return `An image with the text "${text}" displayed in an elegant, decorative serif font. The font has high contrast between thick and thin strokes, giving the text a sophisticated and stylized appearance. The text is in ${foregroundColor}, set against a solid ${backgroundColor} background, creating a striking and bold visual contrast. Incorporate elements related to ancient Egyptian motifs, such as Ankhs, Eye of Horus, scarabs, lotus, and hieroglyphs into the design of the font. Each letter features unique, creative touches that make the typography stand out. Incorporate elements related to these motifs, making it very colorful with vibrant hues and gradients.`;
};

export const topBandPrompt = encodeURIComponent(
    "A horizontal centered row on an almost white (#FAFAFA) background featuring one row of evenly spaced icons inspired by Egyptian hieroglyphs. The design should be elegant and minimal, incorporating elements that evoke a sense of mystery and ancient elegance, with subtle, refined lines in black and white."
  );