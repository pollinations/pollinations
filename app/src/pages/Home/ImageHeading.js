import styled from "@emotion/styled"
import { Box, Container, Paper } from "@material-ui/core"
import { Colors, Fonts, MOBILE_BREAKPOINT } from "../../styles/global"
import { useMemo, useState, useEffect } from "react"
import useRandomSeed from "../../hooks/useRandomSeed";

export const ImageStyle = styled.img`
  height: 600px; /* Set your desired fixed height */
  width: auto;
  margin: 1em;
  max-width: 100%; /* Prevents image from exceeding container width */
  object-fit: contain; /* Maintains aspect ratio without cropping */

  @media (max-width: 600px) {
    /* Adjustments for mobile devices */
    height: auto; /* Allows height to adjust based on width */
    width: 100%; /* Image takes up full width of its container */
  }
`

export const GenerativeImageURLContainer = styled(Container)`
  color: ${Colors.offwhite};
  // background-color: transparent;
  margin: 0em;
  padding: 0em;
  max-width: 960px;
  border-radius: 0px;
  width: 90%;
`

export const ImageURLHeading = styled(
  ({ children, className, whiteText = true, width = 500, height = 150, customPrompt }) => {
    const originalWidth = width
    const originalHeight = height
    width = width * 3
    height = height * 3
    const foregroundColor = typeof whiteText === 'string' ? whiteText : (whiteText ? "white" : "black")
    const backgroundColor = typeof whiteText === 'string' ? "black" : (whiteText ? "black" : "white")
    const defaultPrompt = `an image with the text "${children}" displayed in an elegant, decorative serif font. The font has high contrast between thick and thin strokes, that give the text a sophisticated and stylized appearance. The text is in ${foregroundColor}, set against a solid ${backgroundColor} background, creating a striking and bold visual contrast. Incorporate elements related to pollinations, digital circuitry, such as flowers, chips, insects, wafers, and other organic forms into the design of the font. Each letter features unique, creative touches that make the typography stand out. Incorporate elements related to pollinations, digital circuitry, and organic forms into the design of the font.`
    const prompt = encodeURIComponent(customPrompt || defaultPrompt)

    const seed = useRandomSeed()

    const imageUrl = `https://image.pollinations.ai/prompt/${prompt}?width=${width}&height=${height}&nologo=true&seed=${seed}`

    return (
      <div className={className}>
        <img src={imageUrl} alt={children} style={{ width: `${originalWidth}px`, height: `${originalHeight}px` }} />
      </div>
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
    margin: 0px auto;
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
