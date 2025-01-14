    // Start of Selection
    import { Colors } from "../config/global"
    import discordLogo from "../assets/icons/discord.png"
    import AsciiArtGenerator from "../components/AsciiArtGenerator"
    import { SectionContainer } from "../components/SectionContainer"
    import { SectionSubContainer } from "../components/SectionSubContainer"
    import { DISCORD_SUBTITLE, DISCORD_CTO } from "../config/copywrite"
    import SectionSubtitle from "../components/SectionSubtitle"
    import Button from "@mui/material/Button"
    
    const Discord = () => {
      const handleButtonClick = (e) => {
        e.preventDefault()
        window.open("https://discord.gg/k9F7SyTgqn", "_blank")
      }
    
      return (
        <SectionContainer style={{ backgroundColor: Colors.offwhite, padding: "3em 0" }}>
          <SectionSubContainer>
            <SectionSubtitle color={Colors.offblack} subtitle={DISCORD_SUBTITLE} size={"2em" }/>
            <AsciiArtGenerator />
            <Button
              onClick={handleButtonClick}
              sx={{
                color: Colors.offblack,
                userSelect: "none",
                fontFamily: "Uncut-Sans-Variable, sans-serif",
                fontWeight: "bold",
                lineHeight: "40px",
                fontSize: { xs: "20px", sm: "24px" },
                backgroundColor: `${Colors.offblack}`,
                borderRadius: "15px",
                padding: "0.5em 1em",
                margin: "1em 0",
                display: "flex",
                alignItems: "center",
                "&:hover": {
                  backgroundColor: `${Colors.offblack}90`,
                },
              }}
            >
              <img
                src={discordLogo}
                alt="Discord Logo"
                style={{ height: "2em", marginRight: "1em" }}
              />
              <SectionSubtitle color={Colors.offwhite} subtitle={DISCORD_CTO} />
            </Button>
          </SectionSubContainer>
        </SectionContainer>
      )
    }
    
    export default Discord
