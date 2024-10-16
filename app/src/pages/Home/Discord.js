import styled from "@emotion/styled"
import { useMemo } from "react"
import { Colors, MOBILE_BREAKPOINT, Fonts } from "../../styles/global"
import { Star as StarBase, LinkStyle, Container as ContainerBase } from "./components"
import { Link } from "react-router-dom"
import { GenerativeImageURLContainer, ImageURLHeading } from "./ImageHeading"
import discordLogo from "../../assets/imgs/discord_logo.png"
import { usePollinationsImage, usePollinationsText } from "@pollinations/react"
import ReactMarkdown from "react-markdown"
import useIsMobile from "../../hooks/useIsMobile" // Import the new hook
import { EmojiRephrase } from "../../components/EmojiRephrase"
import useRandomSeed from "../../hooks/useRandomSeed"
import AsciiArtGenerator from "../../components/AsciiArtGenerator" // Import the AsciiArtGenerator

const DiscordSection = (props) => {
  const seed = useRandomSeed();
  const isMobile = useIsMobile(); // Use the new hook
  const imageURL = usePollinationsImage(
    "an image with the text 'Discord' displayed in an elegant, decorative serif font. The font has high contrast between thick and thin strokes, that give the text a sophisticated and stylized appearance. The text is in black, set against a solid white background, creating a striking and bold visual contrast. Incorporate elements related to pollinations, digital circuitry, such as flowers, chips, insects, wafers, and other organic forms into the design of the font. Each letter features unique, creative touches that make the typography stand out. Incorporate colorful elements related to pollinators and pollens, insects and plants into the design of the font. Make it very colorful with vibrant hues and gradients.",
    { seed, width: isMobile ? 400 : 700, height: isMobile ? 150 : 200 }
  )

  return (
    <Container>
      <CenteredLink to="https://discord.gg/k9F7SyTgqn'">
        <DiscordLogoHeading src={imageURL} alt="Discord" />
      </CenteredLink>
      <AsciiArtContainer>
        <AsciiArtGenerator />
      </AsciiArtContainer>
      <Body>
        <TextWithLogo>
          <Text style={{ maxWidth: "800px" }}>
            <EmojiRephrase>
              Introduce our Discord channel and incitivate to join, make it just a few words. Don't cite Discord. In one sentence. Format with emojis. Use italics and bold to make the text more engaging.
            </EmojiRephrase>
          </Text>
          <LinkStyle href="https://buymeacoffee.com/pollinations" style={{ zIndex: 10 }}>
            <b>BuyMeACoffee</b>
          </LinkStyle>
        </TextWithLogo>
        <br />

        <Logo src={discordLogo} alt="Discord Logo" />
        <br />
        <LinkStyle href="https://discord.gg/k9F7SyTgqn" style={{ zIndex: 10 }}>
          <b>join our discord</b>
        </LinkStyle>
      </Body>
    </Container>
  )
}

export default DiscordSection

const Container = styled(ContainerBase)`
  position: relative;
  min-height: auto;
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  gap: 0px;
  background-color: ${Colors.background_body};

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    flex-direction: column;
    gap: 0px;
  }
`

const CenteredLink = styled(Link)`
  display: flex;
  justify-content: center;
  width: 100%;
  margin-top: 2em;
`

const DiscordLogoHeading = styled.img`
  width: 100%;
  max-width: 500px;
`

const AsciiArtContainer = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  pointer-events: none; /* Ensure it doesn't interfere with other elements */
`

const Body = styled.div`
  font-family: ${Fonts.body};
  font-style: normal;
  font-weight: 500;
  font-size: 40px;
  line-height: 50px;
  color: ${Colors.offblack};
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 2em;

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    font-size: 24px;
    line-height: 30px;
  }
`

const TextWithLogo = styled.div`
  display: flex;
  align-items: center;
  text-align: center;

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    flex-direction: column;
  }
`

const Text = styled.div`
  display: flex;
  flex-direction: column;
`

const Logo = styled.img`
  width: 90px;
  height: auto;

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    margin-left: 0;
    width: 60px;
    height: auto;
  }
`
