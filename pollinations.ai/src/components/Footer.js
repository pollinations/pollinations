import styled from "@emotion/styled"
import { NavLink } from "react-router-dom"
import { Box } from "@material-ui/core"
import { SocialLinks } from "./Social"
import { Colors, MOBILE_BREAKPOINT, HUGE_BREAKPOINT, BaseContainer } from "../styles/global"
import { LinkStyle } from "../pages/Home/components"
import { ImageURLHeading } from "../pages/Home/ImageHeading"
import AsciiArtGenerator from "./AsciiArtGenerator"
import useIsMobile from "../hooks/useIsMobile" // Import the new hook
import logo from "../assets/imgs/thot-labs_logo.svg"

const Footer = () => {
  const isMobile = useIsMobile() // Use the new hook

  return (
    <OuterContainer>
      <FooterStyle>
        {/* <Box
          display="flex"
          flexDirection="column"
          alignItems={isMobile ? "center" : "flex-start"}
          justifyContent="flex-end"
        >
          <StyledImageURLHeading whiteText={false} width={250} height={100} isMobile={isMobile}>
            Let's Talk!
          </StyledImageURLHeading>
          {isMobile && <Spacer />}
        </Box> */}
        {/* <AsciiArtContainer>
          <AsciiArtGenerator />
        </AsciiArtContainer> */}
        {/* <SocialContainer>
          <SocialLinks medium gap="1em" invert />
        </SocialContainer> */}
        {/* <LogoContainer>
          <NavLink to="/">
            <ImageURLHeading
              whiteText={false}
              width={isMobile ? 400 : 700}
              height={isMobile ? 150 : 200}
            >
              THOT Labs
            </ImageURLHeading>
          </NavLink>
        </LogoContainer> */}
        <BottomLinksContainer>
          <Box display="flex" alignItems="center">
            {/* <img
            src={logo}
            alt="THOT Labs Logo"
            style={{
              height: "3em",
              opacity: "1",
              marginRight: "1em",
            }}
          /> */}
            <StyledLink
              onClick={(e) => {
                e.preventDefault();
                navigator.clipboard.writeText("hello@thot-labs.com").then(() => {
                  alert("Copied to clipboard");
                }).catch(err => {
                  console.error('Failed to copy: ', err);
                });
              }}
              href="mailto:hello@thot-labs.com"
              style={{ userSelect: "text" }}
            >
              <b>hello@thot-labs.com</b>
            </StyledLink>
          </Box>
          <StyledNavLink to="/terms">
            <b>TERMS & CONDITIONS</b>
          </StyledNavLink>
        </BottomLinksContainer>
      </FooterStyle>
    </OuterContainer>
  )
}
export default Footer

const OuterContainer = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  background: linear-gradient(to top, ${Colors.gray2}, ${Colors.offwhite});
`

const SocialContainer = styled.div`
  grid-area: social;
  justify-self: flex-start;
  margin-bottom: 2em;
  @media only screen and (max-width: ${MOBILE_BREAKPOINT}) {
    justify-self: center;
    text-align: center;
    margin-top: 2em;
  }
`

const LogoContainer = styled.div`
  grid-area: logo;
  justify-self: flex-end;
  display: flex;
  align-items: flex-end; // Align bottom

  @media only screen and (max-width: ${MOBILE_BREAKPOINT}) {
    justify-self: center;
    text-align: center;
    align-items: center; // Center align on mobile
  }
`

const AsciiArtContainer = styled.div`
  grid-area: ascii-art;
  position: absolute;
  justify-self: center;
  display: flex;
  align-items: center;
  @media only screen and (max-width: ${MOBILE_BREAKPOINT}) {
    justify-self: center;
    padding-top: 2em;
    text-align: center;
  }
`

const BottomLinksContainer = styled.div`
  grid-area: bottom-links;
  display: flex;
  justify-content: space-between;
  width: 100%;
  margin-top: 1em;
  @media only screen and (max-width: ${MOBILE_BREAKPOINT}) {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
`

const FooterStyle = styled(BaseContainer)`
  padding: 0em 3em 1em 3em;
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  grid-template-areas:
    "lets-talk ascii-art logo"
    "social social social"
    "bottom-links bottom-links bottom-links";

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    grid-template-columns: 1fr;
    grid-template-areas:
      "logo"
      "lets-talk"
      "ascii-art"
      "social"
      "bottom-links";
    padding: 0;
    margin-bottom: 2em;
    max-width: 414px;
    text-align: center;
  }

  font-style: normal;
  font-weight: 400;
  font-size: 18px;
  line-height: 23px;

  color: ${Colors.offblack};

  a {
    color: ${Colors.offblack}; // Ensure the text color matches the style in Layouts.js
  }
`

const StyledLink = styled(LinkStyle)`
  transition: color 0.3s ease;
  &:hover {
    color: ${Colors.primary};
  }
`

const StyledNavLink = styled(NavLink)`
  transition: color 0.3s ease;
  &:hover {
    color: ${Colors.primary};
  }
`

const StyledImageURLHeading = styled(ImageURLHeading)`
  margin-bottom: ${(props) => (props.isMobile ? "0" : "0")};
  text-align: ${(props) => (props.isMobile ? "center" : "left")};
  align-items: flex-end; // Align bottom
`

const Spacer = styled.div`
  height: 2em;
`
