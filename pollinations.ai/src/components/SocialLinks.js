import React, { useState } from "react"
import styled from "@emotion/styled"
import { Link } from "@mui/material"
import { SOCIAL_LINKS } from "../config/socialLinksList"
import { Colors } from "../config/global"

// Container styling
const SocialLinksContainer = styled("div")(({ gap, theme }) => ({
  gridArea: "social",
  alignSelf: "center",
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: gap || "0em",
}))

const LinkItem = styled(Link, {
  // Prevent forwarding isHovered to the DOM
  shouldForwardProp: (prop) => prop !== "isHovered",
})(({ theme, isHovered }) => ({
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  borderRadius: "50%",
  border: `1px solid ${Colors.offblack}`,
  backgroundColor: isHovered ? Colors.offblack : Colors.offwhite,
  width: "40px",
  height: "40px",
  transition: "background-color 0.3s, filter 0.3s",
  textDecoration: "none",
}))

const IconImage = styled("img", {
  // Prevent forwarding isHovered and invert to the DOM
  shouldForwardProp: (prop) => !["isHovered", "invert"].includes(prop),
})(({ theme, isHovered, invert }) => ({
  width: "20px",
  height: "auto",
  filter: isHovered ? (invert ? "none" : "invert(100%)") : invert ? "invert(100%)" : "none",
  [theme.breakpoints.down("xs")]: {
    width: "16px",
  },
}))

export const SocialLinks = ({ gap, invert }) => {
  const [hoveredIndex, setHoveredIndex] = useState(null)

  const handleLinkClick = (platform) => {
    trackEvent({
      action: `${platform}_Link_Click`,
      category: 'User_Interactions',
      label: `${platform}_Social_Link`
    })
  }

  return (
    <SocialLinksContainer gap={gap}>
      {Object.keys(SOCIAL_LINKS).map((platform, index) => {
        const isHovered = hoveredIndex === index
        return (
          <LinkItem
            key={`plt_link_${SOCIAL_LINKS[platform]?.url}`}
            href={SOCIAL_LINKS[platform]?.url}
            target="_blank"
            title={platform}
            isHovered={isHovered}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
            onClick={() => handleLinkClick(platform)}
          >
            <IconImage
              src={SOCIAL_LINKS[platform]?.icon_img}
              alt={platform}
              isHovered={isHovered}
              invert={invert}
            />
          </LinkItem>
        )
      })}
    </SocialLinksContainer>
  )
}
