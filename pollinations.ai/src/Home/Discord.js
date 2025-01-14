import { Colors } from "../config/global"
import discordLogo from "../assets/icons/discord_logo.png"
import AsciiArtGenerator from "../components/AsciiArtGenerator"
import { SectionContainer } from "../components/SectionContainer"
import StyledLink from "../components/StyledLink"
import { SectionSubContainer } from "../components/SectionSubContainer"
import { DISCORD_SUBTITLE, DISCORD_CTO } from "../config/copywrite"
import SectionSubtitle from "../components/SectionSubtitle"

const Discord = () => {
  return (
    <SectionContainer style={{ backgroundColor: Colors.offwhite }}>
      <SectionSubContainer>
        <AsciiArtGenerator />
        <SectionSubtitle color={Colors.offblack} subtitle={DISCORD_SUBTITLE} />
        <img src={discordLogo} alt="Discord Logo" style={{ width: "100px", height: "auto" }} />
        <StyledLink
          onClick={(e) => {
            e.preventDefault()
            window.open("https://discord.gg/k9F7SyTgqn", "_blank")
          }}
          href="https://discord.gg/k9F7SyTgqn"
          style={{ userSelect: "text", zIndex: 10 }}
        >
          <b>{DISCORD_CTO}</b>
        </StyledLink>
      </SectionSubContainer>
    </SectionContainer>
  )
}

export default Discord
