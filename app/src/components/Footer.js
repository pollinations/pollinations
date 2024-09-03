import styled from "@emotion/styled"
import { NavLink } from "react-router-dom"
import { SocialLinks } from "./Social"
import { Colors, MOBILE_BREAKPOINT, HUGE_BREAKPOINT, BaseContainer } from "../styles/global"
import { LinkStyle } from "../pages/Home/components"
import DescriptionIcon from "@material-ui/icons/Description"
import { ImageURLHeading } from "../pages/Home/styles"

const Footer = () => {
  return (
    <OuterContainer>
      <FooterStyle>
        <LetsTalkStyle>
          Let's talk
          <br />
          <StyledLink href="mailto:hello@pollinations.ai">
            <b>hello@pollinations.ai</b>
          </StyledLink>
        </LetsTalkStyle>
        <SocialContainer>
          <SocialLinks small gap='1em' invert/>
        </SocialContainer>
        <LogoContainer>
          <NavLink to="/">
            <ImageURLHeading
              whiteText={false}
              width={250}
              height={100}
              customPrompt={`an image with the text "Pollinations" displayed in an elegant, decorative serif font. The font has high contrast between thick and thin strokes, that give the text a sophisticated and stylized appearance. The text is in black, set against a solid white background, creating a striking and bold visual contrast. Incorporate elements related to pollinations, digital circuitry, such as flowers, chips, insects, wafers, and other organic forms into the design of the font. Each letter features unique, creative touches that make the typography stand out. Incorporate elements related to pollinations, digital circuitry, and organic forms into the design of the font. The text should take all the space without any margins.`}
            />
          </NavLink>
        </LogoContainer>
        <TermsLinkContainer>
          <StyledNavLink to="/terms">
            <b>TERMS & CONDITIONS</b>
          </StyledNavLink>
        </TermsLinkContainer>
      </FooterStyle>
    </OuterContainer>
  )
}
export default Footer

const OuterContainer = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  background-color: ${Colors.background_body};
`
const SocialContainer = styled.div`
  grid-area: social;
  justify-self: flex-start;
  @media only screen and (max-width: ${MOBILE_BREAKPOINT}){
    justify-self: center;
  }
`
const LogoContainer = styled.div`
  grid-area: logo;
  justify-self: flex-end;
  padding-top: 0em;
  display: flex;
  align-items: center;
  @media only screen and (max-width: ${MOBILE_BREAKPOINT}) {
    justify-self: center;
    padding-top: 2em;
  }
`
const NavigationContainer = styled.div`
  grid-area: navigation_footer;
  justify-self: flex-end;

  @media only screen and (max-width: ${MOBILE_BREAKPOINT}) {
    justify-self: center;
  }
`

const TermsLinkContainer = styled.div`
  grid-area: terms;
  justify-self: flex-end;
  margin-bottom: 2em;
  color: ${Colors.offblack};
  @media only screen and (max-width: ${MOBILE_BREAKPOINT}) {
    justify-self: center;
    margin-top: 2em;
  }
`

const LetsTalkStyle = styled.p`
  grid-area: lets-talk;
  justify-self: flex-start;
  font-style: normal;
  font-weight: 500;
  span {
    color: ${Colors.offblack};
  }   
  font-size: 28px;
  line-height: 42px;
  color: ${Colors.offblack};
  @media only screen and (max-width: ${MOBILE_BREAKPOINT}){
    justify-self: center;
    padding-bottom: 0em;
  }
`

const Items = ({ items, renderComponent, columns }) =>
  split(Object.keys(items), columns).map((col) => (
    <ItemsStyle>{col.map(renderComponent)}</ItemsStyle>
  ))
const ItemsStyle = styled.div`
  display: flex;
  gap: 3em;
  width: 100%;
`

function split(array, cols) {
  if (cols === 1) return [array]
  var size = Math.ceil(array.length / cols)
  return [array.slice(0, size)].concat(split(array.slice(size), cols - 1))
}

const FooterStyle = styled(BaseContainer)`
  padding: 3em 86px 0 86px;

  width: 100%;
  padding-bottom: 30px;
  display: grid;
  grid-template-columns: 1fr 1fr;

  grid-template-areas:
    "lets-talk logo"
    "social terms"
    "navigation_footer navigation_footer";

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    grid-template-columns: 1fr;
    grid-template-areas:
      "logo"
      "navigation_footer"
      "lets-talk"
      "social"
      "terms";
    padding: 0;
    margin-bottom: 2em;
    max-width: 414px;
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
