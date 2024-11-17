import styled from "@emotion/styled"
import { Box, Container, Paper } from "@material-ui/core"
import { Colors, Fonts, MOBILE_BREAKPOINT } from "../../styles/global"
import { useMemo, useState, useEffect } from "react"
import useRandomSeed from "../../hooks/useRandomSeed";
import { usePollinationsImage, usePollinationsText } from "@pollinations/react";
import { useTranslatedPollinationsText } from "../../hooks/useResponsivePollinationsText";
import PromptTooltip from "../../components/PromptTooltip";

export const ImageStyle = styled.img`
  height: 600px;
  max-width: 100%;
  object-fit: contain;
`

export const GenerativeImageURLContainer = styled(Container)`
  color: ${Colors.offwhite};
  margin: 0em auto;
  padding: 0em;
  max-width: 960px;
  border-radius: 0px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
`

export const ImageURLHeading = styled(
  ({ children, className, whiteText = true, width = 500, height = 150, customPrompt }) => {
    const originalWidth = width;
    const originalHeight = height;
    width = width * 3;
    height = height * 3;
    const foregroundColor = typeof whiteText === 'string' ? whiteText : (whiteText ? "white" : "black");
    const backgroundColor = typeof whiteText === 'string' ? "black" : (whiteText ? "black" : "white");

    const translatedPrompt = usePollinationsText("Translate the following text to i18n: '" + navigator.language.split("-")[0] + "'. If the text is already in English, just return the text. Don't give any explanation. Text:" + children, { seed: 45 });

    const defaultPrompt = `An image with the text "${translatedPrompt || children}" displayed in an elegant, decorative serif font. The font has high contrast between thick and thin strokes, that give the text a sophisticated and stylized appearance. The text is in ${foregroundColor}, set against a solid ${backgroundColor} background, creating a striking and bold visual contrast. Incorporate elements related to pollinations, digital circuitry, such as flowers, chips, insects, wafers, and other organic forms into the design of the font. Each letter features unique, creative touches that make the typography stand out. Incorporate elements related to pollinations, digital circuitry, and organic forms into the design of the font.`;
    const prompt = encodeURIComponent(customPrompt || defaultPrompt);

    const seed = useRandomSeed();

    const imageUrl = usePollinationsImage(prompt, { width, height, nologo: true, seed, enhance: true });

    const [currentImageUrl, setCurrentImageUrl] = useState(imageUrl);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
      if (!loading) {
        setLoading(true);
        const img = new Image();
        img.src = imageUrl;
        img.onload = () => {
          setCurrentImageUrl(imageUrl);
          setLoading(false);
        };
      }
    }, [imageUrl]);

    return (
      <PromptTooltip title={customPrompt || defaultPrompt} seed={seed}>
        <div className={className}>
          <img src={currentImageUrl} alt={children} style={{ width: `${originalWidth}px`, height: `${originalHeight}px`, overflow: 'hidden' }} />
        </div>
      </PromptTooltip>
    )
  }
)`
  text-align: center;
  margin: 10px auto;

  img {
    width: 100%;
    max-width: 500px;
    height: auto;
  }

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    margin: 0px 0;
  }
`

export const ImageContainer = styled(Paper)`
  width: 100%; 
  display: flex;
  justify-content: center;
  align-items: center;
`

export const URLExplanation = styled(Box)`
  margin: 0em;
  font-size: 0.9em;
`