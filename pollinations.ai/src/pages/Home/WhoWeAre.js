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
          <EmojiRephrase>Talk to us, reach out</EmojiRephrase>
          <br />
          <StyledLink href="https://discord.gg/k9F7SyTgqn" target="_blank" rel="noopener noreferrer">
            <b>Discord</b>
          </StyledLink>{" "}
          <span className="mobile-break">or at </span>
          <StyledLink
            href="mailto:hello@pollinations.ai"
            onClick={(e) => {
              handleLinkClick(e);
              alert("Copied");
            }}
            style={{ userSelect: "text" }}
          >
            <b>hello@pollinations.ai</b>
          </StyledLink>
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

const pulse = keyframes`
  0% { transform: scale(1); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); }
`

const NewBadge = styled.span`
  display: inline-block;
  background: rgba(255, 255, 255, 0.2);
  padding: 0.2em 0.6em;
  border-radius: 20px;
  margin-right: 0.5em;
  animation: ${pulse} 2s infinite ease-in-out;
`

const AnnouncementBanner = styled.div`
  background: linear-gradient(45deg, #FF6B6B, #4ECDC4);
  color: white;
  padding: 1.5em;
  margin: 1em auto 2.5em;
  border-radius: 15px;
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
  text-align: center;
  animation: ${fadeIn} 0.5s ease-out;
  max-width: 90%;
  font-size: 1.1em;
  line-height: 1.5;

  a {
    color: white;
    text-decoration: none;
    font-weight: bold;
    background: rgba(255, 255, 255, 0.2);
    padding: 0.3em 0.8em;
    border-radius: 25px;
    transition: all 0.2s ease;
    display: inline-block;
    margin: 0 0.3em;

    &:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: translateY(-1px);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
  }

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    margin: 1em;
    font-size: 0.95em;
    padding: 1.2em;
  }
`

export default function WhoWeAre() {
  return (
    <Style>
      <PageLayout long={false}>
        <AnnouncementBanner>
          🎉 <NewBadge><b>NEW!</b></NewBadge> Want to improve Pollinations? Create a{" "}
          <StyledLink 
            href="https://github.com/pollinations/pollinations/issues/new"
            style={{ color: "white" }}
          >
            GitHub issue
          </StyledLink>{" "}
          and our AI coding assistant will implement it automatically!
        </AnnouncementBanner>
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
