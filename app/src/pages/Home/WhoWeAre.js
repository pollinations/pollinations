import styled from "@emotion/styled"
import React from "react"
import { Colors, MOBILE_BREAKPOINT, BaseContainer } from "../../styles/global"
import DescriptionIcon from "@material-ui/icons/Description"
import { keyframes } from "@emotion/react"
import ReactMarkdown from 'react-markdown';
import Box from '@material-ui/core/Box';
import useRandomSeed from "../../hooks/useRandomSeed"
import { EmojiRephrase } from "../../components/EmojiRephrase"
import StyledLink from "../../components/StyledLink"; // Updated import
import useResponsivePollinationsText from "../../hooks/useResponsivePollinationsText"
import PromptTooltip from "../../components/PromptTooltip"

const WhoWeAreContent = () => {
  const handleLinkClick = (e) => {
    e.preventDefault()
    const link = e.currentTarget.href
    navigator.clipboard.writeText(link).then(() => {
      console.log(`Copied to clipboard: ${link}`)
    })
  }

  const seed = useRandomSeed();
  const prompt = "Introduce the team of machine-learning specialists, artists and futurists and highlight that they are deeply engaged in the open source AI ecosystem. In one sentence. Format with emojis. Use italics and bold to make the text more engaging."
  const markdownText = useResponsivePollinationsText(prompt, { seed });

  return (
    <Box maxWidth="1000px" style={{ margin: "0 auto" }}>
      <h2 style={{ userSelect: "none" }}>
        <PromptTooltip title={prompt} seed={seed}>
          <ReactMarkdown
            components={{
              p: (props) => <p {...props} style={{ fontSize: "36px", userSelect: "none" }} />,
            }}
          >
            {markdownText}
          </ReactMarkdown>
        </PromptTooltip>
      </h2>
      <ContactWrapper>
        <p style={{ userSelect: "none" }}>
          <EmojiRephrase> talk to us, reach out on [Discord](https://discord.gg/k9F7SyTgqn) or at [hello@pollinations.ai](mailto:hello@pollinations.ai)</EmojiRephrase>
          {/* <StyledLink href="https://discord.gg/k9F7SyTgqn">
            <b>Discord</b>
          </StyledLink>{" "}
          <span className="mobile-break">or at </span>
          <StyledLink href="mailto:hello@pollinations.ai" onClick={handleLinkClick}>
            <b>hello@pollinations.ai</b>
          </StyledLink> */}
        </p>
        <p style={{ userSelect: "none" }}>
          <StyledLink href="https://github.com/pollinations/pollinations/#readme">
            <b>README</b>
            <DescriptionIcon style={{ fontSize: "inherit", verticalAlign: "middle" }} />{" "}
          </StyledLink>{" "}
          to learn more.
        </p>
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
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 1em;

  h2 {
    initial: unset;
    font-family: "Uncut-Sans-Variable";
    font-style: normal;
    font-weight: 500;
    font-size: 36px;
    line-height: 58px;
    color: ${(props) => (props.dark ? Colors.offwhite : Colors.offblack)};
    letter-spacing: -0.02em;
    margin-bottom: 1.6em;
    margin-top: 1em;

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
    margin: 0; // Remove margin as it's now handled by ContactWrapper
    user-select: none;
    i {
      color: ${(props) => (props.dark ? Colors.accent : Colors.offblack)};
    }
    @media (max-width: ${MOBILE_BREAKPOINT}) {
      width: 100%;
      font-size: 22px;
      text-align: center; /* Center text horizontally on mobile */
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
  margin-bottom: 5em;

  p {
    width: 45%; // Adjust this value as needed
    margin: 0;
  }

  p:last-child {
    text-align: right;
  }

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    flex-direction: column;
    align-items: center; /* Center all items horizontally on mobile */

    p {
      width: 100%;
      text-align: center; /* Center text horizontally on mobile */
    }

    p:last-child {
      text-align: center; /* Center text horizontally on mobile */
    }

    .mobile-break {
      display: block;
    }
  }

  .mobile-break {
    display: inline;
  }
`
