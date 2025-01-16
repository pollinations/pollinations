import styled from "@emotion/styled"
import { Box, Paper } from "@mui/material"
import { useState, useEffect } from "react"
import useRandomSeed from "../hooks/useRandomSeed"
import { usePollinationsImage, usePollinationsText } from "@pollinations/react"
import PromptTooltip from "./PromptTooltip"
import { getDefaultPrompt } from "../config/stylePrompt"
import { Colors } from "../config/global"

export const ImageStyle = styled.img`
  height: 600px;
  max-width: 100%;
  object-fit: contain;
`

export const ImageHeading = styled(
  ({
    children,
    className,
    isWhiteBG = true,
    width = 150,
    height = 150,
    customPrompt,
  }) => {
    const originalWidth = width
    const originalHeight = height
    width = width * 3
    height = height * 3

    const translatedPrompt = usePollinationsText(
      "Translate the following text to i18n: '" +
        navigator.language.split("-")[0] +
        "'. If the text is already in English, just return the text. Don't give any explanation. Text:" +
        children,
      { seed: 45 }
    )

    const promptText = getDefaultPrompt(translatedPrompt || children, isWhiteBG)
    const prompt = encodeURIComponent(customPrompt || promptText)

    const seed = useRandomSeed()

    const imageUrl = usePollinationsImage(prompt, {
      width,
      height,
      nologo: true,
      seed,
      enhance: true,
    })

    const [currentImageUrl, setCurrentImageUrl] = useState(imageUrl)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
      if (!loading) {
        setLoading(true)
        const img = new Image()
        img.src = imageUrl
        img.onload = () => {
          setCurrentImageUrl(imageUrl)
          setLoading(false)
        }
      }
    }, [imageUrl])

    return (
      <PromptTooltip title={customPrompt || promptText} seed={seed}>
        <div className={className}>
          <img
            src={currentImageUrl}
            alt={children}
            style={{
              width: `${originalWidth}px`,
              height: `${originalHeight}px`,
              overflow: "hidden",
            }}
          />
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

  ${({ theme }) => theme.breakpoints.down("md")} {
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
