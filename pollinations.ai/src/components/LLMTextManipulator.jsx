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
