import React from "react";
import usePollinationsText from "../hooks/usePollinationsText.js";

/**
 * Component to display plain text from Pollinations based on the given prompt.
 *
 * @param {Object} props - The properties object.
 * @param {string} props.children - The prompt to generate the text.
 * @param {number} [props.seed=-1] - The seed for random text generation.
 * @param {string} [props.systemPrompt] - Optional system prompt to guide the text generation.
 * @returns {JSX.Element} - The PollinationsText component.
 */
const PollinationsText = ({ children, seed = -1, systemPrompt, ...props }) => {
  const text = usePollinationsText(children, { seed, systemPrompt });

  return React.createElement('div', props, text);
};

export default PollinationsText;
