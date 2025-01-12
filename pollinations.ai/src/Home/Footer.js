import styled from "@emotion/styled"
import { NavLink } from "react-router-dom"
import { Box } from "@mui/material"
import { SocialLinks } from "../components/Social"
import { Colors, MOBILE_BREAKPOINT, BaseContainer } from "../config/global"
import StyledLink from "../components/StyledLink"
import { ImageURLHeading } from "../components/ImageHeading"
import AsciiArtGenerator from "../components/AsciiArtGenerator"
import useIsMobile from "../hooks/useIsMobile" // Import the new hook
import { SectionContainer } from "../components/SectionContainer"

const Footer = () => {
  const isMobile = useIsMobile() // Use the new hook

  return (
    <SectionContainer
      style={{
        background: `linear-gradient(to top, ${Colors.gray2}, ${Colors.offwhite})`,
      }}
    >
      {/* <AsciiArtContainer>
          <AsciiArtGenerator />
        </AsciiArtContainer> */}
      {/* <SocialContainer>
          <SocialLinks medium gap="1em" invert />
        </SocialContainer> */}
      <Box
        display="flex"
        flexDirection={isMobile ? "column" : "row"}
        alignItems="center"
        justifyContent="space-between"
        width="100%"
        padding="1em"
      >
        <StyledLink
          onClick={(e) => {
            e.preventDefault()
            navigator.clipboard.writeText("hello@thot-labs.com").then(() => {})
          }}
          href="mailto:hello@thot-labs.com"
          style={{ userSelect: "text" }}
        >
          <b>hello@thot-labs.com</b>
        </StyledLink>

        <StyledLink to="/terms" as={NavLink}>
          <b>TERMS & CONDITIONS</b>
        </StyledLink>
      </Box>
    </SectionContainer>
  )
}
export default Footer

