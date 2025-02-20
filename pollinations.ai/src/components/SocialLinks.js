import React, { useState } from "react"
import styled from "@emotion/styled"
import { Link } from "@mui/material"
import { SOCIAL_LINKS } from "../config/socialLinksList"
import { Colors } from "../config/global"
import { trackEvent } from "../config/analytics"
import { ReactSVG } from "react-svg"

// Container styling
const SocialLinksContainer = styled("div")(({ gap }) => ({
  gridArea: "social",
  display: "flex",
  alignItems: "center",
  gap: gap || "0em",
}))

const LinkItem = styled(Link, {
  // Prevent forwarding isHovered to the DOM
  shouldForwardProp: (prop) => prop !== "isHovered",
})(({ isHovered }) => ({
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  borderRadius: "50%",
  border: `1px solid ${Colors.offblack}`,
  backgroundColor: isHovered ? Colors.offblack : Colors.offwhite,
  width: "40px",
  height: "40px",
  transition: "background-color 0.3s",
  textDecoration: "none",
}))

// Replacing the <img> with a Styled ReactSVG to control the svg fill dynamically
const StyledReactSVG = styled(ReactSVG, {
  shouldForwardProp: (prop) => prop !== "isHovered",
})(({ isHovered }) => ({
  "& svg": {
    fill: isHovered ? Colors.offwhite : Colors.offblack,
    transition: "fill 0.3s",
    width: "100%",
    height: "100%",
  },
}))

export const SocialLinks = ({ gap, location }) => {
  const [hoveredIndex, setHoveredIndex] = useState(null)

  const handleLinkClick = (platform) => {
    trackEvent({
      action: `click_${platform}`,
      category: location,
    })
  }

  return (
    <SocialLinksContainer gap={gap}>
      {Object.keys(SOCIAL_LINKS).map((platform, index) => {
        const isHovered = hoveredIndex === index
        const { url, icon, width, height } = SOCIAL_LINKS[platform]
        return (
          <LinkItem
            key={`plt_link_${url}`}
            href={url}
            target="_blank"
            title={platform}
            isHovered={isHovered}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
            onClick={() => handleLinkClick(platform)}
          >
            <StyledReactSVG
              src={icon}
              isHovered={isHovered}
              wrapper="span"
              aria-label={`${platform}-icon`}
              style={{ width, height }}
            />
          </LinkItem>
        )
      })}
    </SocialLinksContainer>
  )
}
