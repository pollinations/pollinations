import styled from "@emotion/styled"
import { useMemo } from "react"
import { Colors, MOBILE_BREAKPOINT, Fonts } from "../../styles/global"
import { Star as StarBase, LinkStyle, Container as ContainerBase } from "./components"
import { Link } from "react-router-dom"
import { GenerativeImageURLContainer, ImageURLHeading } from "./styles"
import discordLogo from "../../assets/imgs/discord_logo.png"

const DiscordSection = (props) => {
  return (
    <Style>
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
    </Style>
  )
}

export default DiscordSection

const Style = styled.div`
  width: 100%;

  position: relative;
  background-color: ${Colors.background_body};

  display: flex;
  justify-content: center;
  align-items: center;
  @media (max-width: ${MOBILE_BREAKPOINT}) {
    min-height: 100px;
  }
`
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
  @media (max-width: ${MOBILE_BREAKPOINT}) {
    max-width: 260px;
    margin-top: 0em;
  }
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
    font-size: 36px;
    line-height: 45px;
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
    margin-bottom: 20px;
  }
`
