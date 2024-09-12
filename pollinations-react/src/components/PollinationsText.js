import React from "react";
import usePollinationsText from "../hooks/usePollinationsText";

/**
 * Component to display plain text from Pollinations based on the given prompt.
 *
 * @param {Object} props - The properties object.
 * @param {string} props.children - The prompt to generate the text.
 * @param {number} [props.seed=-1] - The seed for random text generation.
 * @returns {JSX.Element} - The PollinationsText component.
 */
const PollinationsText = ({ children, seed = -1 }) => {
  const text = usePollinationsText(children, seed);

  return <div>{text}</div>;
};

export default PollinationsText;
