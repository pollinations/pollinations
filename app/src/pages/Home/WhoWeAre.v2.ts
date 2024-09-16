import styled from "@emotion/styled"
import React, { useState } from "react"
import { Colors, MOBILE_BREAKPOINT, BaseContainer } from "../../styles/global"
import { LinkStyle } from "./components"
import { keyframes } from "@emotion/react"
import { PollinationsMarkdown } from "@pollinations/react"
import { ImageURLHeading } from "./ImageHeading"
import { Grid } from "@material-ui/core"

const WhoWeAreContent = () => {
  const [showCopied, setShowCopied] = useState(false)

  const handleLinkClick = (e) => {
    e.preventDefault()
    const link = e.currentTarget.href
    navigator.clipboard.writeText(link).then(() => {
      console.log(`Copied to clipboard: ${link}`)
      setShowCopied(true)
      setTimeout(() => {
        setShowCopied(false)
      }, 3000)
    })
  }

  const handleEmailClick = (e) => {
    e.preventDefault()
    const email = "hello@pollinations.ai"
    navigator.clipboard.writeText(email).then(() => {
      console.log(`Copied to clipboard: ${email}`)
      setShowCopied(true)
      setTimeout(() => {
        setShowCopied(false)
      }, 3000)
    })
  }

  return (
    <>
      <ContactWrapper>
        <Grid container spacing={2}>
          {/* First Column */}
          <Grid item xs={12} sm={6}>
            {/* A: Contact Heading */}
            <h2 style={{ userSelect: "none" }}>
              <PollinationsMarkdown
                components={{
                  p: (props) => <p {...props} style={{ fontSize: "36px", userSelect: "none" }} />,
                }}
              >
                Introduce the team of machine-learning specialists, artists and futurists and highlight
                that they are deeply engaged in the open source AI ecosystem. In one sentence. Format with
                emojis. Use italics and bold to make the text more engaging.
              </PollinationsMarkdown>
            </h2>

            {/* B: Discord Link */}
            <ImageOverlayWrapper
              onClick={handleLinkClick}
              className={showCopied ? "show-copied" : ""}
            >
              {/* Base Image */}
              <ImageURLHeading
                className="base-image"
                customPrompt={`Create an image featuring a large, prominent Discord logo button...`}
                width={300}
                height={100}
                whiteText={"false"}
              />
              {/* Overlay Image */}
              <ImageURLHeading
                className="overlay-image"
                customPrompt={`Create an image featuring a large, prominent Discord logo button...`}
                width={300}
                height={100}
                whiteText={"yellow"}
              />
              {/* Copied Image */}
              <ImageURLHeading
                className="copied-image"
                customPrompt={`Create an image featuring a large, prominent button that...`}
                width={300}
                height={100}
                whiteText={"false"}
              />
            </ImageOverlayWrapper>

            {/* C: hello@pollinations.ai Copy Email */}
            <ImageOverlayWrapper
              onClick={handleEmailClick}
              className={showCopied ? "show-copied" : ""}
            >
              {/* Base Image */}
              <ImageURLHeading
                className="base-image"
                customPrompt={`Create an image featuring a large, prominent button that...`}
                width={300}
                height={100}
                whiteText={"false"}
              />
              {/* Overlay Image */}
              <ImageURLHeading
                className="overlay-image"
                customPrompt={`Create an image featuring a large, prominent button that...`}
                width={300}
                height={100}
                whiteText={"yellow"}
              />
              {/* Copied Image */}
              <ImageURLHeading
                className="copied-image"
                customPrompt={`Create an image featuring a large, prominent button that...`}
                width={300}
                height={100}
                whiteText={"false"}
              />
            </ImageOverlayWrapper>
          </Grid>

          {/* Second Column */}
          <Grid item xs={12} sm={6}>
            {/* D: Readme Link */}
            <StyledLink href="/readme">
              <ImageOverlayWrapper>
                {/* Base Image */}
                <ImageURLHeading
                  className="base-image"
                  customPrompt={`Create an image featuring a large, prominent button that...`}
                  width={400}
                  height={200}
                  whiteText={false}
                />
                {/* Overlay Image */}
                <ImageURLHeading
                  className="overlay-image"
                  customPrompt={`Create an image featuring a large, prominent button that...`}
                  width={400}
                  height={200}
                  whiteText={"yellow"}
                />
              </ImageOverlayWrapper>
            </StyledLink>

            {/* E: Readme Subtitle */}
            <ImageURLHeading
              customPrompt={`Design an image featuring black text that reads ‘to learn more’...`}
              width={250}
              height={100}
              whiteText={false}
            />
          </Grid>
        </Grid>
      </ContactWrapper>
    </>
  )
}

export default function WhoWeAre() {
  return (
    <Style>
      <PageLayout long={false}>
        <WhoWeAreContent />
      </PageLayout>
    </Style>
  )
}

// STYLES (unchanged styles from your original code)