import React from "react";
import { usePollinationsText } from "@pollinations/react";
import ReactMarkdown from "react-markdown";
import styled from "@emotion/styled";
import { useTheme, useMediaQuery } from "@mui/material";
import { Colors } from "../config/global";
import { context } from "../config/copywrite";
import { translate } from "../config/llmTransforms";

// function AnimatedDots() {
//   const [dotCount, setDotCount] = useState(1)

//   useEffect(() => {
//     const interval = setInterval(() => {
//       setDotCount((count) => (count % 3) + 1)
//     }, 500)
//     return () => clearInterval(interval)
//   }, [])

//   return <span>{".".repeat(dotCount)}</span>
// }

// Fallback text mapping for when API fails
const getFallbackText = (text) => {
    const fallbacks = {
        "Introduce our open-source platform that provides easy-to-use text and image generation APIs. It requires no sign-ups or API keys, prioritizing user privacy and anonymity. 20 words maximum.":
            "Free, open-source platform for easy text and image generation. No sign-ups or API keys required.",
        "Talk to us, reach out.":
            "Join our community",
        "Join on Discord (do not use markdown link formatting)":
            "Join on Discord",
        "Ask if the user has created a project that integrates Pollinations.AI and would like it to be featured in this section. Keep in short, one sentence":
            "Have you built something with Pollinations.AI? We'd love to feature your project!",
        "Introduce our community-driven approach. We're building a platform where developers, creators, and AI enthusiasts can collaborate and innovate.":
            "Join our community of developers, creators, and AI enthusiasts building the future of generative AI.",
        "Introduce our Discord channel, make it just a few words. In a single very short sentence.":
            "Connect with our community",
        "Highlight our GitHub repository as a hub for collaboration and contribution. In a single very short sentence.":
            "Contribute to our open-source platform",
        "Discover how to seamlessly integrate our free image and text generation API into your projects.":
            "Discover how to integrate our free API into your projects.",
        "We're grateful to our supporters for their contributions to our platform.":
            "We're grateful to our supporters for their contributions to our platform.",
    };
    
    return fallbacks[text] || text;
};

// 2) combine helper
const combine = (text, transformations, props) => `
# Context
${context}

# Instructions:
Apply the following transformations to the text in order:

${transformations
    .map((t) => t(props))
    .filter(Boolean)
    .map((s) => `- ${s}`)
    .join("\n")}

Only output the final text, nothing else. Links should be in markdown format.

# Input Text:
${text}
`;

export function LLMTextManipulator({ text, transforms = [] }) {
    const theme = useTheme();
    const isXs = useMediaQuery(theme.breakpoints.only("xs"));
    const userLanguage = navigator.language || navigator.userLanguage;

    const prompt = combine(text, [translate, ...transforms], {
        isXs,
        userLanguage,
    });
    const transformedText = usePollinationsText(prompt);

    if (!transformedText) {
        return <span>Generating...</span>;
    }

    // If the transformed text is an error message, fallback to clean text
    if (transformedText.startsWith("An error occurred while generating text:")) {
        const fallbackText = getFallbackText(text);
        return (
            <MarkDownStyle>
                <ReactMarkdown>{fallbackText}</ReactMarkdown>
            </MarkDownStyle>
        );
    }

    return (
        <MarkDownStyle>
            <ReactMarkdown>{transformedText}</ReactMarkdown>
        </MarkDownStyle>
    );
}

const MarkDownStyle = styled.div`
  a {
    color: ${Colors.lime};
    text-decoration: none;
    &:hover {
      text-decoration: underline;
    }
  }
  p {
    margin: 0;
  }
`;
