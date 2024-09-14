import styled from "@emotion/styled"
import { useMemo } from "react"
import { Colors, MOBILE_BREAKPOINT, Fonts } from "../../styles/global"
import { Star as StarBase, LinkStyle, Container as ContainerBase } from "./components"
import { Link } from "react-router-dom"
import { GenerativeImageURLContainer, ImageURLHeading } from "./ImageHeading"
import discordLogo from "../../assets/imgs/discord_logo.png"

const DiscordSection = (props) => {
  return (
    <Container>
      <CenteredLink to="https://discord.gg/k9F7SyTgqn'">
        <DiscordLogoHeading>Discord</DiscordLogoHeading>
      </CenteredLink>
      <Body>
        <TextWithLogo>
          <Logo src={discordLogo} alt="Discord Logo" />
          <Text>
            Discuss, get help and <br />
            contribute on Discord.
          </Text>
        </TextWithLogo>
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
`

const DiscordLogoHeading = styled((props) => <ImageURLHeading {...props} whiteText={false} />)`
  width: 100%;
  max-width: 500px;
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
  margin-right: 40px;

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    margin-right: 0;
      width: 60px;
  height: auto;
    margin-bottom: 20px;
  }
`
