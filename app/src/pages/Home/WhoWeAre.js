import styled from "@emotion/styled"
import React from "react"
import { Colors, MOBILE_BREAKPOINT, HUGE_BREAKPOINT, BaseContainer } from "../../styles/global"
import { LinkStyle } from "./components"
import DescriptionIcon from "@material-ui/icons/Description"
import { keyframes } from "@emotion/react"
import { PollinationsText } from "pollinations-react"

const StyledLink = styled(LinkStyle)`
  transition: color 0.3s ease;
  &:hover {
    color: ${(props) => (props.dark ? Colors.accent : Colors.primary)};
  }
`

const WhoWeAreContent = () => (
    <>
        <h2>
            {/* We are a team of <b>machine-learning specialists</b>, <b>artists</b> and <b>futurists </b>{" "}
        deeply engaged in the <b>open source</b> AI ecosystem. */}
            <PollinationsText>
                We are a team of <b>machine-learning specialists</b>, <b>artists</b> and <b>futurists </b>
                deeply engaged in the <b>open source</b> AI ecosystem.
            </PollinationsText>
        </h2>
        <ContactWrapper>
            <p>
                To talk to us, reach out on{" "}
                <StyledLink href="https://discord.gg/k9F7SyTgqn">
                    <b>Discord</b>
                </StyledLink>{" "}
                <span className="mobile-break">or at </span>
                <StyledLink href="mailto:hello@pollinations.ai">
                    <b>hello@pollinations.ai</b>
                </StyledLink>
            </p>
            <p>
                <StyledLink href="/readme">
                    <b>README</b>
                    <DescriptionIcon style={{ fontSize: "inherit", verticalAlign: "middle" }} />{" "}
                </StyledLink>{" "}
                to learn more.
            </p>
        </ContactWrapper>
    </>
)

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
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 1em;
  padding: 7%;
  margin: auto;
  animation: ${fadeIn} 1.5s ease-out;

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    padding: 5em 5%;
  }

  @media (min-width: ${MOBILE_BREAKPOINT}) and (max-width: ${HUGE_BREAKPOINT}) {
    padding: 6em 6%;
  }

  h2 {
    initial: unset;
    font-family: "Uncut-Sans-Variable";
    font-style: normal;
    font-weight: 500;
    font-size: 36px;
    line-height: 58px;
    color: ${(props) => (props.dark ? Colors.offwhite : Colors.offblack)};
    margin-top: 1.6em;
    letter-spacing: -0.02em;
    margin-bottom: 1em;
    margin-top: 3em;

    @media (max-width: ${MOBILE_BREAKPOINT}) {
      font-size: 30px;
      line-height: 40px;
      margin-bottom: 1.6em;
      margin-top: 1.6em;
    }
  }
  p {
    width: ${(props) => props.long || "37%"};
    font-family: "Uncut-Sans-Variable";
    font-style: normal;
    font-weight: 400;
    font-size: 24px;
    line-height: 34px;
    color: ${(props) => (props.dark ? Colors.offwhite : Colors.offblack)};
    margin: 0; // Remove margin as it's now handled by ContactWrapper
    i {
      color: ${(props) => (props.dark ? Colors.accent : Colors.offblack)};
    }
    @media (max-width: ${MOBILE_BREAKPOINT}) {
      width: 90%;
      font-size: 22px;
    }
  }

  // Add this new style for the last paragraph
  p:last-child {
    margin-bottom: 0; // Remove bottom margin for the last paragraph
  }
`

const Style = styled.div`
  width: 100%;
  position: relative;
  background-color: ${(props) => (props.dark ? "black" : Colors.background_body)};
  @media (max-width: ${MOBILE_BREAKPOINT}) {
  }
`

const ContactWrapper = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  width: 100%;

  p {
    width: 45%; // Adjust this value as needed
    margin: 0;
  }

  p:last-child {
    text-align: right;
  }

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    flex-direction: column;

    p {
      width: 100%;
      margin-bottom: 1.6em;
    }

    p:last-child {
      text-align: left;
    }

    .mobile-break {
      display: block;
    }
  }

  .mobile-break {
    display: inline;
  }
`
