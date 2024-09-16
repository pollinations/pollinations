import styled from "@emotion/styled"
import React, { useState } from "react"
import { Colors, MOBILE_BREAKPOINT, BaseContainer } from "../../styles/global"
import { keyframes } from "@emotion/react"
import { PollinationsMarkdown } from "@pollinations/react"
import { ImageURLHeading } from "./ImageHeading"
import { Grid, Box } from "@material-ui/core"

// Define the abstracted style for insects interacting with the button/logo
const MyGenerateStyle = `Add many small, colorful, and whimsical insects—such as ladybugs, butterflies, and beetles—playfully interacting with the elements (crawling over or perched upon them or around them). The insects should be illustrated in a vibrant, artistic style, adding a touch of fun and color without overwhelming the simplicity of the design. The overall image should be clean, elegant, and visually engaging.`

const ImageOverlayWrapper = styled.div`
  position: relative;
  width: 50%;
  cursor: pointer; /* Add cursor pointer for hand icon */

  &:hover .overlay-image {
    opacity: 1;
  }

  .base-image,
  .overlay-image,
  .copied-image {
    position: absolute;

    width: 100%;
    height: 100%;
    transition: opacity 0.3s ease;
  }

  .overlay-image,
  .copied-image {
    opacity: 0;
  }

  &.show-copied .copied-image {
    opacity: 1;
  }

  &.show-copied .base-image,
  &.show-copied .overlay-image {
    opacity: 0;
  }
`

const WhoWeAreContent = () => {
  const [showCopied, setShowCopied] = useState(false)

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
    <Box height={MOBILE_BREAKPOINT ? "640px" : "1200px"} width="100%">
      <h2>
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
      <ContactWrapper>
        <Box>
          <Grid container>
            {/* Row 1 */}
            <Grid item xs={12} sm={6}>
              <Box >
                {/* Component A: Contact Heading */}
                <ImageURLHeading
                  customPrompt={`Create a minimalist image with black text on a white background that reads ‘To talk to us, reach out on’ in an elegant and simple font like Helvetica or Garamond.`}
                  width={300}
                  height={200}
                  whiteText={false}
                />
              </Box>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: "flex", justifyContent: "center" }}>
                {/* Component E: Readme Subtitle */}
                <ImageURLHeading
                  customPrompt={`Design an image featuring black text that reads ‘...to Learn More’ in an elegant and simple font like Helvetica or Arial. Use a solid white background to make the text and colors stand out. The overall design should be clear, concise, elegant, and visually appealing.`}
                  width={250}
                  height={200}
                  whiteText={false}
                />
              </Box>
            </Grid>

            {/* Row 2 */}
            <Grid item xs={12} sm={6} >
              <Box sx={{ display: "flex", justifyContent: "center" }}>
                {/* Component B: Discord Link */}
                <ImageOverlayWrapper
                  onClick={() => window.open("https://discord.gg/k9F7SyTgqn", "_blank")}
                >
                  {/* Base Image */}
                  <ImageURLHeading
                    className="base-image"
                    customPrompt={`Create an image featuring a large, prominent button that occupies almost the entire canvas, centered against a white background. The Discord button should have a striking shiny blue color with slightly rounded edges to emphasize its clickable appearance.${MyGenerateStyle}`}
                    width={150}
                    height={125}
                    whiteText={"false"}
                  />
                  {/* Overlay Image */}
                  <ImageURLHeading
                    className="overlay-image"
                    customPrompt={`Create an image featuring a large, prominent button that occupies almost the entire canvas, centered against a white background. The Discord button should have a striking shiny black color with slightly rounded edges to emphasize its clickable appearance.${MyGenerateStyle}`}
                    width={150}
                    height={125}
                    whiteText={"yellow"}
                  />
                  {/* Copied Image */}
                  <ImageURLHeading
                    className="copied-image"
                    customPrompt={`Create an image featuring a large, prominent button that occupies almost the entire canvas, centered against a white background. The button should be fitting a square and have a shiny red color with slightly rounded edges to emphasize its clickable appearance. On the button, display the text ‘Copied!’ in bold black text, using a clean, legible font like Arial or Helvetica, centered both horizontally and vertically. ${MyGenerateStyle}`}
                    width={150}
                    height={125}
                    whiteText={"false"}
                  />
                </ImageOverlayWrapper>

                {/* Component C: hello@pollinations.ai Copy Email */}
                <ImageOverlayWrapper
                  onClick={handleEmailClick}
                  className={showCopied ? "show-copied" : ""}
                >
                  {/* Base Image */}
                  <ImageURLHeading
                    className="base-image"
                    customPrompt={`Create an image featuring a large, prominent button that occupies almost the entire canvas, centered against a white background. The top of the button pattern looks like a honeycomb, it has slightly rounded edges to emphasize its clickable appearance. On the button, display the email address ‘hello@pollinations.ai’ in bold black text, using a clean, legible font like Arial or Helvetica, centered both horizontally and vertically. There are small bees playing around and on top of it.${MyGenerateStyle}`}
                    width={300}
                    height={125}
                    whiteText={"false"}
                  />
                  {/* Overlay Image */}
                  <ImageURLHeading
                    className="overlay-image"
                    customPrompt={`Create an image featuring a large, prominent button that occupies almost the entire canvas, centered against a white background.  The top of the button pattern looks like a honeycomb, but black, it has slightly rounded edges to emphasize its clickable appearance. On the button, display the email address ‘hello@pollinations.ai’ in bold yellow text, using a clean, legible font like Arial or Helvetica, centered both horizontally and vertically. There are small bees playing around and on top of it. ${MyGenerateStyle}`}
                    width={300}
                    height={125}
                    whiteText={"yellow"}
                  />
                  {/* Copied Image */}
                  <ImageURLHeading
                    className="copied-image"
                    customPrompt={`Create an image featuring a large, prominent button that occupies almost the entire canvas, centered against a white background. The top of the button pattern looks like a honeycomb but red, it has slightly rounded edges to emphasize its clickable appearance. On the button, display the text ‘Copied!’ in bold black text, using a clean, legible font like Arial or Helvetica, centered both horizontally and vertically. There are small bees playing around and on top of it.${MyGenerateStyle}`}
                    width={300}
                    height={125}
                    whiteText={"false"}
                  />
                </ImageOverlayWrapper>
              </Box>
            </Grid>
            <Grid item xs={12} sm={6}>
            <Box sx={{ display: "flex", justifyContent: "center" }}>
            {/* Component D: Readme Link */}
                <ImageOverlayWrapper onClick={() => (window.location.href = "/readme")}>
                  {/* Base Image */}
                  <ImageURLHeading
                    className="base-image"
                    customPrompt={`
                      Create an image featuring a large, prominent button that occupies almost the entire canvas, centered against a white background. The button should have a shiny green color with slightly rounded edges to emphasize its clickable appearance. On the button, display the text ‘READ.ME’ in bold white text, using a clean, legible font like Arial or Helvetica, centered both horizontally and vertically. There is minimal floppy disk logo to the text. ${MyGenerateStyle}`}
                    width={300}
                    height={125}
                    whiteText={true}
                  />
                  {/* Overlay Image */}
                  <ImageURLHeading
                    className="overlay-image"
                    customPrompt={`
                      Create an image featuring a large, prominent button that occupies almost the entire canvas, centered against a white background. The button should have a solid black color with slightly rounded edges to emphasize its clickable appearance. On the button, display the text ‘READ.ME’ in bold yellow text, using a clean, legible font like Arial or Helvetica, centered both horizontally and vertically. Add a floppy disk logo to the text to emphasize the save functionality. ${MyGenerateStyle}`}
                    width={400}
                    height={125}
                    whiteText={"yellow"}
                  />
                </ImageOverlayWrapper>
              </Box>
            </Grid>
          </Grid>
        </Box>
      </ContactWrapper>
    </Box>
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

// STYLES
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
`

const PageLayout = styled(BaseContainer)`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  animation: ${fadeIn} 1.5s ease-out;

  h2 {
    font-family: "Uncut-Sans-Variable";
    font-style: normal;
    font-weight: 500;
    font-size: 36px;
    line-height: 58px;
    color: ${(props) => (props.dark ? Colors.offwhite : Colors.offblack)};
    letter-spacing: -0.02em;
    margin-top: 2em;
    margin-bottom: 2em;
    text-align: center;

    @media (max-width: ${MOBILE_BREAKPOINT}) {
      font-size: 30px;
      line-height: 40px;
    }
  }
  p {
    font-family: "Uncut-Sans-Variable";
    font-style: normal;
    font-weight: 400;
    font-size: 24px;
    line-height: 34px;
    color: ${(props) => (props.dark ? Colors.offwhite : Colors.offblack)};
    user-select: none;
    i {
      color: ${(props) => (props.dark ? Colors.accent : Colors.offblack)};
    }
    @media (max-width: ${MOBILE_BREAKPOINT}) {
      font-size: 22px;
    }
  }

  p:last-child {
  }
`

const Style = styled.div`
  position: relative;
  background-color: ${(props) => (props.dark ? "black" : Colors.background_body)};
  @media (max-width: ${MOBILE_BREAKPOINT}) {
  }
`

const ContactWrapper = styled.div`
  @media (max-width: ${MOBILE_BREAKPOINT}) {
    p:last-child {
    }

    .mobile-break {
      display: block;
    }
  }

  .mobile-break {
    display: inline;
  }
`
