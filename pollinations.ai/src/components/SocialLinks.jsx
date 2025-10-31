import React, { useState } from "react";
import styled from "@emotion/styled";
import { Link } from "@mui/material";
import { SOCIAL_LINKS } from "../config/socialLinksList";
import { Colors } from "../config/global";
import { trackEvent } from "../config/analytics";
import { ReactSVG } from "react-svg";

// Container styling
const SocialLinksContainer = styled("div")(({ gap }) => ({
    gridArea: "social",
    display: "flex",
    alignItems: "center",
    gap: gap || "0em",
}));

const LinkItem = styled(Link, {
    // Prevent forwarding isHovered to the DOM
    shouldForwardProp: (prop) => prop !== "isHovered",
})(({ isHovered }) => ({
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: "50%",
    border: `3px solid ${isHovered ? "#05ffa1" : "#ff61d8"}`,
    backgroundColor: isHovered ? "linear-gradient(135deg, #ff61d8, #05ffa1)" : "white",
    width: "40px",
    height: "40px",
    transition: "all 0.3s ease",
    textDecoration: "none",
    boxShadow: isHovered ? "0 4px 12px rgba(255, 97, 216, 0.3)" : "0 2px 6px rgba(0, 0, 0, 0.1)",
    transform: isHovered ? "translateY(-2px)" : "translateY(0)",
    animation: isHovered ? "link-border-shift 8s infinite linear" : "none",
    "@keyframes link-border-shift": {
        "0%": { borderColor: "#ff61d8" },
        "33%": { borderColor: "#05ffa1" },
        "66%": { borderColor: "#ffcc00" },
        "100%": { borderColor: "#ff61d8" },
    },
}));

// Replacing the <img> with a Styled ReactSVG to control the svg fill dynamically
const StyledReactSVG = styled(ReactSVG, {
    shouldForwardProp: (prop) => !["isHovered", "invert"].includes(prop),
})(({ isHovered, invert }) => ({
    "& svg": {
        fill: isHovered ? "#000000" : "#ff61d8",
        transition: "fill 0.3s ease",
        width: "100%",
        height: "100%",
    },
}));

export const SocialLinks = ({ gap, location, invert }) => {
    const [hoveredIndex, setHoveredIndex] = useState(null);

    const handleLinkClick = (platform) => {
        trackEvent({
            action: `click_social_link`,
            category: location,
            value: platform,
        });
    };

    return (
        <SocialLinksContainer gap={gap}>
            {Object.keys(SOCIAL_LINKS).map((platform, index) => {
                const isHovered = hoveredIndex === index;
                const { url, icon, width, height } = SOCIAL_LINKS[platform];
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
                        sx={
                            invert
                                ? {
                                      border: `1px solid ${Colors.offwhite}`,
                                      backgroundColor: isHovered
                                          ? Colors.offblack
                                          : "transparent",
                                  }
                                : {}
                        }
                    >
                        <StyledReactSVG
                            src={icon}
                            isHovered={isHovered}
                            invert={invert}
                            wrapper="span"
                            aria-label={`${platform}-icon`}
                            style={{ width, height }}
                        />
                    </LinkItem>
                );
            })}
        </SocialLinksContainer>
    );
};
